/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const {defer} = require("support/defer");

function createFactory(direct, cls) {
	return Object.freeze({
		_cls: cls,
		_info: (direct ? cls : cls.prototype),
		_ctor: (direct ?
				(function(iid) {
					return this._cls.QueryInterface(iid);
				})
				: (function() {
					return new this._cls();
				})
				),
		createInstance: function(outer, iid) {
			if (outer) {
				throw Cr.NS_ERROR_NO_AGGREGATION;
			}
			return this._ctor(iid);
		},
		register: function() {
			const i = this._info;
			try {
				Cm.registerFactory(i.classID, i.classDescription, i.contractID, this);
			}
			catch (ex) {
			    if (ex.result === Cr.NS_ERROR_FACTORY_EXISTS) {
				    defer(this.register.bind(this));
				    return;
			    } else {
			        throw ex;
		        }
			}

			if (i.xpcom_categories) {
				for (let category of i.xpcom_categories) {
					Services.catman.addCategoryEntry(category, i.classDescription, i.contractID, false, true);
				}
			}
			unload(this.unregister.bind(this));
		},
		unregister: function() {
			try {
				const i = this._info;
				if (i.xpcom_categories) {
					for (let category of i.xpcom_categories) {
						Services.catman.deleteCategoryEntry(category, i.classDescription, false);
					}
				}
				// defer, see bug 753687
				defer((function(Cm, clsid) {
					try {
						Cm.unregisterFactory(clsid, this);
					}
					catch (ex) {
						Components.utils.reportError(ex);
					}
				}).bind(this, Cm, i.classID));
			}
			catch (ex) {
				Components.utils.reportError(ex);
			}
		}
	});
}

exports.registerComponents = function registerComponents(components, direct) {
	for (let cls of components) {
		createFactory(direct, cls).register();
	}
};
