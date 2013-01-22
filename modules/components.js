exports.registerComponents = function registerComponents(components) {
	for (let cls of components) {
		const factory = Object.freeze({
			_cls: cls,
			createInstance: function(outer, iid) {
				if (outer) {
					throw Cr.NS_ERROR_NO_AGGREGATION;
				}
				return new this._cls();
			},
			register: function() {
				const cls = this._cls;
				Cm.registerFactory(cls.prototype.classID, cls.prototype.classDescription, cls.prototype.contractID, this);
				if (cls.prototype.xpcom_categories) {
					for (let category of cls.prototype.xpcom_categories) {
						Services.catman.addCategoryEntry(category, cls.prototype.classDescription, cls.prototype.contractID, false, true);
					}
				}
				unload(this.unregister.bind(this));
			},
			unregister: function() {
				const cls = this._cls;
				if (cls.prototype.xpcom_categories) {
					for (let category of cls.prototype.xpcom_categories) {
						Services.catman.deleteCategoryEntry(category, cls.prototype.classDescription, false);
					}
				}
				Cm.unregisterFactory(this._cls.prototype.classID, this);
			}
		});
		factory.register();
	}
};
