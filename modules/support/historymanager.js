/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const {Logger} = requireJSM("resource://dta/utils.jsm");
const prefs = require("preferences");
const pbm = require("support/pbm");

const validators = {
	'directory': function(s) {
		try {
			new Instances.LocalFile(s);
			return true;
		}
		catch (ex) {
			Cu.reportError(ex);
		}
		return false;
	}
};

function History(key) {
	this._key = key;
	if (key in validators) {
		this._validator = validators[key];
	}
	else {
		this._validator = function() true;
	}
	this._setPersisting(!pbm.browsingPrivately);
}
History.prototype = {
	_key: null,
	get key() {
		return this._key;
	},
	_sessionHistory: [],
	_persisting: true,
	get persisting() {
		return this._persisting;
	},
	_setPersisting: function(persist) {
		if (persist == this._persisting) {
			// not modified
			return;
		}
		if (!persist) {
			// need to clone
			this._sessionHistory = this.values;
		}
		this._persisting = !!persist;
	},
	get _values() {
		if (!this._persisting) {
			return this._sessionHistory;
		}
		let json = prefs.getExt(this._key, '[]');
		let rv = [];
		try {
			rv = JSON.parse(json);
		}
		catch (ex) {
			if (Logger.enabled) {
				Logger.log("Histories: Parsing of history failed: " + json, ex);
			}
		}
		if (!rv.length) {
			try {
				rv = JSON.parse(prefs.getExt(this._key + ".default", '[]'));
			}
			catch (ex) {
				if (Logger.enabled) {
					Logger.log("Cannot apply default values", ex);
				}
			}
		}
		return rv;
	},
	get values() {
		return this._values.filter(this._validator);
	},
	_setValues: function(values) {
		if (!this._persisting) {
			if (Logger.enabled) {
				Logger.log("Set session history for " + this._key);
			}
			this._sessionHistory = values;
		}
		else {
			try {
				prefs.setExt(this._key, JSON.stringify(values));
				if (Logger.enabled) {
					Logger.log("Set normal history for " + this._key + " to " + JSON.stringify(values));
				}
			}
			catch (ex) {
				if (Logger.enabled) {
					Logger.log("Histories: Setting values failed" + values, ex);
				}
				throw ex;
			}
		}
	},
	push: function(value) {
		try {
			value = value.toString();
			let values = this._values.filter(function(e) e != value);
			values.unshift(value);
			let max = prefs.getExt('history', 5);
			if (Logger.enabled) {
				Logger.log("Histories: " + this._key + ", before " + values.toSource());
				Logger.log("Histories: " + this._key + ", max " + max);
			}
			while (values.length > max) {
				values.pop();
			}
			if (Logger.enabled) {
				Logger.log("Histories: " + this._key + ", after" + values.toSource());
			}
			this._setValues(values);
		}
		catch (ex) {
			if (Logger.enabled) {
				Logger.log("Histories: Push failed!", ex);
			}
		}
	},
	reset: function(value) {
		if (Logger.enabled) {
			Logger.log("Histories: Reset called");
		}
		this._setValues([]);
	}
};

const _histories = {};

const callbacks = {
	enterPrivateBrowsing: function() {
		if (Logger.enabled) {
			Logger.log("entering pbm: switching to session histories");
		}
		for each (let h in _histories) {
			h._setPersisting(false);
		}
	},
	exitPrivateBrowsing: function() {
		if (Logger.enabled) {
			Logger.log("exiting pbm: switching to persisted histories");
		}
		for each (let h in _histories) {
			h._setPersisting(true);
		}
	}
};
pbm.registerCallbacks(callbacks);

/**
 * Gets the History Instance for a key
 * @param key History to get
 * @return
 */
exports.getHistory = function getHistory(key) {
	if (!(key in _histories)) {
		return (_histories[key] = new History(key));
	}
	return _histories[key];
}
