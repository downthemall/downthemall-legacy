var AlertService = {
	_alerting: false,
	_service: Cc['@mozilla.org/alerts-service;1']
		.getService(Ci.nsIAlertsService),
	show: function(title, msg, clickable, cookie) {
		if (this._alerting) {
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
makeObserver(AlertService);