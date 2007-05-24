var AlertService = {
	_alerting: false,
	_init: function() {
		if ('@mozilla.org/alerts-service;1' in Cc && 'nsIAlertsService' in Ci) {
			// some systems do not have this service
			try {
				this._service = Cc['@mozilla.org/alerts-service;1'].getService(Ci.nsIAlertsService);
				makeObserver(this);
				this._available = true;
			}
			catch (ex) {
				// no-op
			}
			return null;
		}
	},
	get available() {
		return this._available;
	},
	_available: false,
	_service: null,
	show: function(title, msg, clickable, cookie) {
		if (!this.available) {
			throw new Components.Exception("Alerting Service not available on this platform!");
		}
		if (this._alerting || !this._service) {
			return;
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
AlertService._init();