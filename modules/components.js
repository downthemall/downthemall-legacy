const {defer} = require("support/defer");

exports.registerComponents = function registerComponents(components, direct) {
	for (let cls of components) {
		const factory = Object.freeze({
			_cls: cls,
			_info: (direct ? cls : cls.prototype),
			_ctor: (direct ? (function(iid) this._cls.QueryInterface(iid)) : (function() new this._cls())),
			createInstance: function(outer, iid) {
				if (outer) {
					throw Cr.NS_ERROR_NO_AGGREGATION;
				}
				return this._ctor(iid);
			},
			register: function() {
				const i = this._info;
				Cm.registerFactory(i.classID, i.classDescription, i.contractID, this);
				if (i.xpcom_categories) {
					for (let category of i.xpcom_categories) {
						Services.catman.addCategoryEntry(category, i.classDescription, i.contractID, false, true);
					}
				}
				unload(this.unregister.bind(this));
			},
			unregister: function() {
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
		});
		factory.register();
	}
};
