/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const prefs = require("preferences");

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
			log(LOG_ERROR, "Histories: Parsing of history failed: " + json, ex);
		}
		if (!rv.length) {
			try {
				rv = JSON.parse(prefs.getExt(this._key + ".default", '[]'));
			}
			catch (ex) {
				log(LOG_ERROR, "Cannot apply default values", ex);
			}
		}
		return rv;
	},
	get values() {
		return this._values.filter(this._validator);
	},
	_setValues: function(values) {
		if (!this._persisting) {
			log(LOG_DEBUG, "Set session history for " + this._key);
			this._sessionHistory = values;
		}
		else {
			try {
				prefs.setExt(this._key, JSON.stringify(values));
				log(LOG_DEBUG, "Set normal history for " + this._key + " to " + JSON.stringify(values));
			}
			catch (ex) {
				log(LOG_ERROR, "Histories: Setting values failed" + values, ex);
				throw ex;
			}
		}
	},
	push: function(value, once) {
		try {
			value = value.toString();
			if (this._values[0] === value) {
				return;
			}
			let values = this._values.filter(function(e) e != value);
			if (once && values.length > 0) {
				let top = values.shift();
				values.unshift(top, value);
			}
			else {
				values.unshift(value);
			}
			let max = prefs.getExt('history', 5);
			if (log.enabled) {
				log(LOG_DEBUG, "Histories: " + this._key + ", before " + values.toSource());
				log(LOG_DEBUG, "Histories: " + this._key + ", max " + max);
			}
			while (values.length > max) {
				values.pop();
			}
			if (log.enabled) {
				log(LOG_DEBUG, "Histories: " + this._key + ", after" + values.toSource());
			}
			this._setValues(values);
		}
		catch (ex) {
			log(LOG_ERROR, "Histories: Push failed!", ex);
		}
	},
	reset: function(value) {
		log(LOG_INFO, "Histories: Reset called");
		this._setValues([]);
	}
};

const _histories = {};

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
