var playersViewComponent = {
	template: "#players-view-template",
	data: function() {
		// Once the api populates 'players' so that it's not null, the loading spinner will disappear
		return {
			players: null,
			isRatesEnabled: false,
			strengthSit: "all",
			minimumToi: 0,
			visibleColumns: {
				individual: true,
				onIceGoals: false,
				onIceCorsi: false
			},
			sort: {
				col: "ip",
				order: -1
			},
			search: {
				col: "name",
				query: ""
			},
			pagination: {
				rowsPerPage: 20,
				current: 0,
				total: 0
			},
			columns: [
				{ key: "rank", heading: "", classes: "left-aligned" },
				{ key: "name", heading: "Name", sortable: true, classes: "left-aligned" },
				{ key: "positions", heading: "Pos", sortable: true, classes: "left-aligned" },
				{ key: "teams", heading: "Team", sortable: true, classes: "left-aligned" },
				{ key: "gp", heading: "GP", sortable: true },
				{ key: "toi", heading: "Mins", sortable: true },
				{ key: "ig", heading: "G", sortable: true, hasRate: true, classes: "cols-individual" },
				{ key: "ia", heading: "A", sortable: true, hasRate: true, classes: "cols-individual" },
				{ key: "ip1", heading: "P1", sortable: true, hasRate: true, classes: "cols-individual" },
				{ key: "ip", heading: "P", sortable: true, hasRate: true, classes: "cols-individual" },
				{ key: "ic", heading: "C", sortable: true, hasRate: true, classes: "cols-individual" },
				{ key: "i_sh_pct", heading: "Own Sh%", sortable: true, classes: "cols-individual" },
				{ key: "gf", heading: "GF", sortable: true, hasRate: true, classes: "cols-on-ice-goals" },
				{ key: "ga", heading: "GA", sortable: true, hasRate: true, classes: "cols-on-ice-goals" },
				{ key: "g_diff", heading: "G diff", sortable: true, hasRate: true, classes: "cols-on-ice-goals" },
				{ key: "sh_pct", heading: "Sh%", sortable: true, classes: "cols-on-ice-goals" },
				{ key: "sv_pct", heading: "Sv%", sortable: true, classes: "cols-on-ice-goals" },
				{ key: "cf", heading: "CF", sortable: true, hasRate: true, classes: "cols-on-ice-corsi" },
				{ key: "ca", heading: "CA", sortable: true, hasRate: true, classes: "cols-on-ice-corsi" },
				{ key: "cf_pct", heading: "CF%", sortable: true, classes: "cols-on-ice-corsi" },
				{ key: "cf_pct_rel", heading: "CF%, rel", sortable: true, classes: "cols-on-ice-corsi" },
				{ key: "cf_pct_adj", heading: "CF%, score-adj", sortable: true, classes: "cols-on-ice-corsi" }
			]
		}
	},
	filters: {
		maxDecimalPlaces: function(value, places) {
			var factor = Math.pow(10, places);
			return Math.round(value * factor) / factor;
		},
		signed: function(value) {
			return value > 0 ? "+" + value : value;
		}
	},
	created: function() {
		this.fetchData();
		// Google Analytics
		if (window.location.hostname.toLowerCase() !== "localhost") {
			ga("set", "page", "/players");
			ga("send", "pageview");
		}
	},
	watch: {
		strengthSit: function() {
			this.aggregatePlayerData();
		},
		search: {
			handler: "filterPlayers",
			deep: true
		},
		minimumToi: function() {
			this.filterPlayers();
		}
	},
	computed: {
		playersOnPage: function() {
			return this.players.filter(function(p) { return p.isOnPage; });
		}
	},
	methods: {
		blurInput: function(event) {
			event.target.blur();
		},
		fetchData: function() {
			var self = this;
			var xhr = new XMLHttpRequest();
			xhr.open("GET", "./api/players/");
			xhr.onload = function() {
				// Parse json, then append additional properties that don't change based on the strength situation
				self.players = JSON.parse(xhr.responseText)["players"];
				self.players.forEach(function(p) {
					p["first"] = p["first"].replace(/\./g, "");
					p["last"] = p["last"].replace(/\./g, "");
					p["name"] = (p["first"] + " " + p["last"]).toLowerCase();
					p["positions"] = p["positions"].toString().toLowerCase();
					p["teamNames"] = p["teams"].map(function(t) {
						return constants.teamNames[t];
					});
					p["teamNames"] = p["teamNames"].toString().toLowerCase();
					p["teams"] = p["teams"].toString().toLowerCase();
					// Flag for filtering and paging
					// Default isOnPage to false - otherwise the first render will include all players
					p["isFilteredOut"] = false;
					p["isOnPage"] = false;
				});
				self.aggregatePlayerData();
			}
			xhr.send();
		},
		aggregatePlayerData: function() {
			// To aggregate data, use a method that we can explicitly call instead of a computed property
			// Using a computed property caused laggy input fields - it seemed like each time an input changed, 
			// the computed property would check each player and stat to see if any values changed
			var sits = this.strengthSit === "all" ? ["ev5", "pp", "sh", "penShot", "noOppG", "noOwnG", "other"] : [this.strengthSit];
			var stats = ["toi", "ig", "is", "ic", "ia1", "ia2", "gf", "ga", "sf", "sa", "cf", "ca", "cf_adj", "ca_adj", "cf_off", "ca_off"];
			this.players.forEach(function(p) {
				stats.forEach(function(st) {
					p[st] = _.sumBy(
						p.data.filter(function(row) { return sits.indexOf(row["strength_sit"]) >= 0; }),
						function(row) { return row[st]; }
					);
				});
			});

			// Convert to rates (per 60 minutes) if enabled
			if (this.isRatesEnabled) {
				this.players.forEach(function(p) {
					stats.forEach(function(st) {
						if (st !== "toi") {
							p[st] = (p[st] / p["toi"]) * 60 * 60;
						}
					});
				});
			}

			// Compute additional stats
			var self = this;
			this.players.forEach(function(p) {

				p["ia"] = p["ia1"] + p["ia2"];
				p["ip1"] = p["ig"] + p["ia1"];
				p["ip"] = p["ig"] + p["ia1"] + p["ia2"];
				p["i_sh_pct"] = p["is"] === 0 ? 0 : 100 * p["ig"] / p["is"];
				p["g_diff"] = p["gf"] - p["ga"];
				p["sh_pct"] = p["sf"] === 0 ? 0 : 100 * p["gf"] / p["sf"];
				p["cf_pct"] = p["cf"] + p["ca"] === 0 ? 0 : 100 * p["cf"] / (p["cf"] + p["ca"]);
				p["cf_pct_rel"] = (p["cf"] + p["ca"] === 0 || p["cf_off"] + p["ca_off"] === 0) ? 0
					: 100 * (p["cf"] / (p["cf"] + p["ca"]) - p["cf_off"] / (p["cf_off"] + p["ca_off"]));
				p["cf_pct_adj"] = p["cf_adj"] + p["ca_adj"] === 0 ? 0 : 100 * p["cf_adj"] / (p["cf_adj"] + p["ca_adj"]);

				// For the "all" strengthSit, exclude ga and sa while a player's own net is empty when calculating svPct
				var noOwnG_ga = 0;
				var noOwnG_sa = 0;
				if (self.strengthSit === "all") {
					var noOwnG_row = p.data.find(function(row) { return row["strength_sit"] === "noOwnG"; });
					if (noOwnG_row) {
						noOwnG_ga = noOwnG_row["ga"];
						noOwnG_sa = noOwnG_row["sa"];						
					}
				}
				var svPctGa = p["ga"] - noOwnG_ga;
				var svPctSa = p["sa"] - noOwnG_sa;
				p["sv_pct"] = svPctSa === 0 ? 0 : 100 * (1 - svPctGa / svPctSa);
			});

			// Refilter and resort players based on updated stats
			this.filterPlayers();
			this.sortPlayers();
		},
		sortBy: function(newSortCol) {
			if (newSortCol === this.sort.col) {
				this.sort.order *= -1;
			} else {
				this.sort.col = newSortCol;
				this.sort.order = -1;
			}
			this.sortPlayers();
		},
		sortPlayers: function() {
			var order = this.sort.order < 0 ? "desc" : "asc";
			this.players = _.orderBy(this.players, this.sort.col, order);
			this.pagination.current = 0;
			this.flagPlayersOnPage();
			this.rankPlayers();
		},
		filterPlayers: 
			_.debounce(
				function() {
					// Find players matching search string
					var matchedPlayers = this.players;
					if (this.search.query) {
						var col = this.search.col;
						var query = this.search.query.toLowerCase();
						if (col === "name") {
							matchedPlayers = matchedPlayers.filter(function(p) { return p[col].indexOf(query) >= 0; });
						} else if (col === "teams") {
							matchedPlayers = matchedPlayers.filter(function(p) { return p[col].indexOf(query) >= 0 || p["teamNames"].indexOf(query) >= 0; });
						} else if (col === "positions" && query === "f") {
							matchedPlayers = matchedPlayers.filter(function(p) { return p[col].indexOf("c") >= 0 || p[col].indexOf("r") >= 0 || p[col].indexOf("l") >= 0; });
						} else if (col === "positions") {
							matchedPlayers = matchedPlayers.filter(function(p) { return p[col].indexOf(query) >= 0; });
						}
					}
					// Find players satisying minimum toi
					if (this.minimumToi) {
						var min = this.minimumToi;
						matchedPlayers = matchedPlayers.filter(function(p) { return Math.round(p["toi"] / 60) >= min; });
					}
					// Update filter players' flag
					this.players.map(function(p) { 
						p.isFilteredOut = true;
						return p;
					});
					matchedPlayers.map(function(p) { 
						p.isFilteredOut = false;
						return p;
					});
					// Reset current page to 0
					this.pagination.current = 0;
					this.rankPlayers();
					this.flagPlayersOnPage();
				}, 350
			),
		rankPlayers: function() {
			// Don't show ranks if sorting by columns like name, position, team
			var col = this.sort.col;
			if (["name", "positions", "teams"].indexOf(col) >= 0) {
				this.players.map(function(p) {
					p["rank"] = ["", false];
					return p;
				});
			} else {
				// Only rank players that aren't filtered out
				var rankedPlayers = this.players.filter(function(p) { return !p.isFilteredOut; });
				// Get array of sorted values - we'll use this to get a player's rank
				var values = rankedPlayers.map(function(p) { return p[col]; });
				// Group players by their stat value - we'll use this to check for tied ranks
				var valueCounts = _.groupBy(rankedPlayers, col);
				// Update player ranks - don't display ranks if there's only 1 player in the table
				this.players.forEach(function(p) {
					p["rank"] = ["", false];
					if (rankedPlayers.length > 1) {
						if (!p.isFilteredOut) {
							// Use idx0 to store rank, idx1 to indicate if tied
							p["rank"][0] = values.indexOf(+p[col]) + 1;
							if (valueCounts[p[col]].length > 1) {
								p["rank"][1] = true;
							}
						}
					}
				});
			}
		},
		flagPlayersOnPage: function() {
			// Using a function to flag on-page players and a computed property to filter the on-page players results in better performance
			// This way, we only start flagging players after the filterPlayers debounce
			// Sanitize page input and get the start and end indices
			var playersNotFilteredOut = this.players.filter(function(p) { return !p.isFilteredOut; });
			this.pagination.total = Math.ceil(playersNotFilteredOut.length / this.pagination.rowsPerPage);
			this.pagination.current = Math.min(this.pagination.total - 1, Math.max(0, this.pagination.current));
			var startIdx = this.pagination.current * this.pagination.rowsPerPage;
			var endIdx = startIdx + this.pagination.rowsPerPage;
			var playersOnPage = playersNotFilteredOut.slice(startIdx, endIdx);
			// Flag players on page
			this.players.map(function(p) { 
				p.isOnPage = false;
				return p;
			});
			playersOnPage.map(function(p) { 
				p.isOnPage = true;
				return p;
			});
			// Force the playersOnPage computed property to be recomputed
			// Using a deep watcher is slower than setting this.players = [] - the deep watcher seems to check each property in players
			var tmp = this.players;
			this.players = [];
			this.players = tmp;
		}
	}
};