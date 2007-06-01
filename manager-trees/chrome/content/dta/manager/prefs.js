var Prefs = {
	// default values
	showOnlyFilenames: true,
	alertingSystem: (SYSTEMSLASH == '\\') ? 1 : 0,

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
	
	autoClose: false,
	
	setTime: true,
	
	timeout: 300,

	// nsIObserver
	observe: function(subject, topic, prefName) {
		this._refreshPrefs();
	},

	init: function() {
		makeObserver(this);

		try {
			this._refreshPrefs();
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

		[
			'removeCompleted',
			'removeAborted',
			'removeCanceled',
			['autoClose', 'closedta'],
			'timeout',
			['maxInProgress', 'ntask'],
			'maxChunks',
			'setTime',
			'showOnlyFilenames',
			['onConflictingFilenames', 'existing'],
			['alertingSystem', 'alertbox']
		].forEach(
			function(e) {
				if (e instanceof Array) {
					var key = e[0];
					var pref = e[1];
				}
				else {
					var key = e;
					var pref = key.toLowerCase();
				}
				this[key] = Preferences.getDTA(pref, this[key]);
			},
			this
		);

		if (Preferences.get("saveTemp", true)) {
			try {
				this.tempLocation = Preferences.getMultiByteDTA("tempLocation", '');
				if (this.tempLocation == '') {
					// #44: generate a default tmp dir on per-profile basis
					// hash the profD, as it would be otherwise a minor information leak
					var dsp = Cc["@mozilla.org/file/directory_service;1"]
						.getService(Ci.nsIProperties);
					this.tempLocation = dsp.get("TmpD", Ci.nsIFile);
					var profD = hash(dsp.get("ProfD", Ci.nsIFile).leafName);
					this.tempLocation.append("dtatmp-" + profD);
					Debug.dump(this.tempLocation.path);
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