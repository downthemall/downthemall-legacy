var Prefs = {
	// default values
	showOnlyFilenames: true,
	alertingSystem: 0,

	// conflict filenames preference for this session (-1 not setted)
	askEveryTime: true,
	sessionPreference: -1,
	onConflictingFilenames: 3,

	maxInProgress: 5,
	maxChunks: 5,
	tempLocation: null,

	currentTooltip: null,

	removeCompleted: true,
	removeAborted: false,
	removeCanceled: false,

	// nsIObserver
	observe: function(subject, topic, prefName) {
		this._refreshPrefs();
	},

	init: function() {
		makeObserver(this);

		try {
			this.observe();
			var pbi = Cc['@mozilla.org/preferences-service;1']
				.getService(Ci.nsIPrefService)
				.getBranch(null)
				.QueryInterface(Components.interfaces.nsIPrefBranch2)
			;
			pbi.addObserver('extensions.dta.', this, true);
			pbi.addObserver('network.', this, true);
		}
		catch (ex) {
			Debug.dump("failed to add pref-observer", ex);
		}
	},

	_refreshPrefs: function() {
		Debug.dump("pref reload");

		this.removeCompleted = Preferences.getDTA("removecompleted", true);
		this.removeAborted = Preferences.getDTA('removeaborted', false);
		this.removeCanceled = Preferences.getDTA("removecanceled", false);

		this.maxInProgress = Preferences.getDTA("ntask", 5);
		this.maxChunks = Preferences.getDTA("maxchunks", 5);
		this.showOnlyFilenames = Preferences.getDTA("showOnlyFilenames", true);
		this.onConflictingFilenames = Preferences.getDTA("existing", 3);
		this.alertingSystem = Preferences.getDTA("alertbox", (SYSTEMSLASH == '\\') ? 1 : 0);

		if (Preferences.get("saveTemp", true)) {
			try {
				this.tempLocation = Preferences.getMultiByteDTA("tempLocation", '');
				if (this.tempLocation == '') {
					this.tempLocation = Cc["@mozilla.org/file/directory_service;1"]
						.getService(Ci.nsIProperties)
						.get("TmpD", Ci.nsIFile);
					this.tempLocation.append("dta");
				} else {
					this.tempLocation = new FileFactory(this.tempLocation);
				}
			} catch (ex) {
				this.tempLocation = null;
				// XXX: error handling
			}
		}
		var conns = (this.maxInProgress * this.maxChunks + 2) * 2;
		['network.http.max-connections', 'network.http.max-connections-per-server', 'network.http.max-persistent-connections-per-server'].forEach(
			function(e) {
				if (conns > Preferences.get(e, conns)) {
					Preferences.set(e, conns);
				}
				conns /= 2;
			}
		);
	}
}
Prefs.init();