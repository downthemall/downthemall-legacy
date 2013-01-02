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

const BaseHistory = {
	init: function(key) {
		this._key = key;
		if (key in validators) {
			this._validator = validators[key];
		}
		else {
			this._validator = function() true;
		}
	},
	get key() {
		return this._key;
	},
	get values() {
		return this._values.filter(this._validator);
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
}

function PrefHistory(key) {
	this.init(key);
}
PrefHistory.prototype = {
	__proto__: BaseHistory,
	get _values() {
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
	_setValues: function(values) {
		try {
			prefs.setExt(this._key, JSON.stringify(values));
		}
		catch (ex) {
			log(LOG_ERROR, "Histories: Setting values failed" + values, ex);
			throw ex;
		}
	}
};

function MemHistory(key) {
	this.init(key);
	this._setValues((new PrefHistory(this.key)).values);
}
MemHistory.prototype = {
	__proto__: BaseHistory,
	_setValues: function(values) {
		this._values = values;
	}
};

const _normalHistories = {};
var _privateHistories = {};

/**
 * Gets the History Instance for a key
 * @param key History to get
 * @param isPrivate operate on private history only
 * @return
 */
exports.getHistory = function getHistory(key, isPrivate) {
	isPrivate = !!isPrivate;
	let _histories = isPrivate ? _privateHistories : _normalHistories;
	let _ctor = isPrivate ? MemHistory : PrefHistory;
	if (!(key in _histories)) {
		return (_histories[key] = new _ctor(key));
	}
	return _histories[key];
}

require("support/pbm").registerPrivatePurger(function purgePrivateHistories() {
	_privateHistories = {};
});
