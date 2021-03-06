var teamsViewComponent = {
	template: "#teams-view-template",
	data: function() {
		// Once the api populates 'teams' so that it's not null, the loading spinner will disappear
		return {
			teams: null,
			isRatesEnabled: false,
			teamsWithAggregatedData: [],
			strengthSit: "all",
			visibleColumns: {
				onIceGoals: true,
				onIceCorsi: true
			},
			sort: {
				col: "pts",
				order: -1
			},
			columns: [
				{ key: "rank", heading: "", classes: "left-aligned" },
				{ key: "name", heading: "Name", sortable: true, classes: "left-aligned" },
				{ key: "pts", heading: "Pts", sortable: true },
				{ key: "gp", heading: "GP", sortable: true },
				{ key: "toi", heading: "Mins", sortable: true },
				{ key: "gf", heading: "GF", sortable: true, hasRate: true, classes: "cols-on-ice-goals" },
				{ key: "ga", heading: "GA", sortable: true, hasRate: true, classes: "cols-on-ice-goals" },
				{ key: "g_diff", heading: "G diff", sortable: true, hasRate: true, classes: "cols-on-ice-goals" },
				{ key: "sh_pct", heading: "Sh%", sortable: true, classes: "cols-on-ice-goals" },
				{ key: "sv_pct", heading: "Sv%", sortable: true, classes: "cols-on-ice-goals" },
				{ key: "cf", heading: "CF", sortable: true, hasRate: true, classes: "cols-on-ice-corsi" },
				{ key: "ca", heading: "CA", sortable: true, hasRate: true, classes: "cols-on-ice-corsi" },
				{ key: "cf_pct", heading: "CF%", sortable: true, classes: "cols-on-ice-corsi" },
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
			ga("set", "page", "/teams");
			ga("send", "pageview");
		}
	},
	watch: {
		strengthSit: function() {
			this.aggregateTeamData();
		}
	},
	computed: {
		sortedTeams: function() {
			var order = this.sort.order < 0 ? "desc" : "asc";
			var col = this.sort.col;
			var teams = _.orderBy(this.teamsWithAggregatedData, col, order);
			// Add rankings
			if (col === "name") {
				teams.map(function(p) {
					p["rank"] = ["", false];
					return p;
				});
			} else {
				// Get array of sorted values - we'll use this to get a team's rank
				var values = teams.map(function(p) { return p[col]; });
				// Group teams by their stat value - we'll use this to check for tied ranks
				var valueCounts = _.groupBy(teams, col);
				// Update team ranks
				teams.forEach(function(p) {
					// Use idx0 to store rank, idx1 to indicate if tied
					p["rank"] = ["", false];
					p["rank"][0] = values.indexOf(+p[col]) + 1;
					if (valueCounts[p[col]].length > 1) {
						p["rank"][1] = true;
					}
				});
			}
			return teams;
		}
	},
	methods: {
		fetchData: function() {
			var self = this;
			var xhr = new XMLHttpRequest();
			xhr.open("GET", "./api/teams/");
			xhr.onload = function() {
				self.teams = JSON.parse(xhr.responseText)["teams"];
				self.aggregateTeamData();
			}
			xhr.send();
		},
		sortBy: function(newSortCol) {
			if (newSortCol === this.sort.col) {
				this.sort.order *= -1;
			} else {
				this.sort.col = newSortCol;
				this.sort.order = -1;
			}
		},
		aggregateTeamData: function() {
			var teams = this.teams;
			var sits = this.strengthSit === "all" ? ["ev5", "pp", "sh", "penShot", "noOppG", "noOwnG", "other"] : [this.strengthSit];
			var stats = ["toi", "gf", "ga", "sf", "sa", "cf", "ca", "cf_adj", "ca_adj"];
			teams.forEach(function(p) {
				stats.forEach(function(st) {
					p[st] = _.sumBy(
						p.data.filter(function(row) { return sits.indexOf(row["strength_sit"]) >= 0; }),
						function(row) { return row[st]; }
					);
				});
			});

			// Convert to rates (per 60 minutes) if enabled
			if (this.isRatesEnabled) {
				teams.forEach(function(p) {
					stats.forEach(function(st) {
						if (st !== "toi") {
							p[st] = (p[st] / p["toi"]) * 60 * 60;
						}
					});
				});
			}

			// Compute additional stats
			var self = this;
			teams.forEach(function(p) {

				p["g_diff"] = p["gf"] - p["ga"];
				p["sh_pct"] = p["sf"] === 0 ? 0 : 100 * p["gf"] / p["sf"];
				p["cf_pct"] = p["cf"] + p["ca"] === 0 ? 0 : 100 * p["cf"] / (p["cf"] + p["ca"]);
				p["cf_pct_adj"] = p["cf_adj"] + p["ca_adj"] === 0 ? 0 : 100 * p["cf_adj"] / (p["cf_adj"] + p["ca_adj"]);

				// For the "all" strengthSit, exclude ga and sa while a team's own net is empty when calculating svPct
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

			// Force the sortedPlayers computed property to be recomputed by setting this.teamsWithAggregatedData = [] before actually updating it
			// This is faster than using a deep watcher on teamsWithAggregatedData (which seems to check every property in teamsWithAggregatedData)
			this.teamsWithAggregatedData = [];
			this.teamsWithAggregatedData = teams;
		}
	}
}