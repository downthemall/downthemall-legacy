var AlertService = {
	init: function() {
		try {
			this._service = Cc['@mozilla.org/alerts-service;1']
				.getService(Ci.nsIAlertsService);
			this._available = true;
		}
		catch (ex) {
			this._available = false;
		}
		if (this.available) {
			makeObserver(this);
		}
	},		
	_alerting: false,
	get available() {
		return this._available;
	},
	show: function(title, msg, clickable, cookie) {
		if (this._alerting) {
			return;
		}
		if (!this.available) {
			throw new Components.Exception("Alerting service not available on this platform!");
		}
		this._alerting = true;
		this._service.showAlertNotification(
			"chrome://dta/skin/common/alert.png",
			title,
			msg,
			clickable,
			cookie,
			this
			);
	},
	observe: function (aSubject, aTopic, aData) {
		switch (aTopic) {
			case "alertfinished":
				// global variable
				this._alerting = false;
				break;
			case "alertclickcallback":
				if (aData != "errore") {
					try {
						OpenExternal.launch(aData);
					}
					catch (ex) {
						// no-op
					}
				}
				break;
		}
	}
};
AlertService.init();