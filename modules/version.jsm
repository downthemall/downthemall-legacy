const EXPORTED_SYMBOLS = ['Version'];

const Cc = Components.classes;
const Ci = Components.interfaces;
const module = Components.utils.import;

module("resource://dta/utils.jsm");

const ID = 'dta@downthemall.net'; 

const runtime = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo).QueryInterface(Ci.nsIXULRuntime);
ServiceGetter(this, "comparator", "@mozilla.org/xpcom/version-comparator;1", "nsIVersionComparator");

Components.utils.reportError("new version");

let _callbacks = [];

const Version = {
		TOPIC_SHOWABOUT: "DTA:showAbout",
		ID: ID,
		LOCALE: Cc["@mozilla.org/chrome/chrome-registry;1"].getService(Ci.nsIXULChromeRegistry).getSelectedLocale('global'),
		APP_NAME: runtime.name.toLowerCase().replace(/ /, ''),
		APP_VERSION: runtime.version,
		APP_ID: runtime.ID,
		VERSION: '0.0',
		BASE_VERSION: '0.0',
		NAME: 'DownThemAll!',
		ready: false,
		showAbout: null,
		compareVersion: function(version, cmp) {
			if (!cmp) {
				[version, cmp] = [this.VERSION, version];
			}
			return comparator.compare(version, cmp);
		},
		getInfo: function(callback) {
			if (this.ready) {
				callback.call(callback, this);
			}
			else {
				_callbacks.push(callback);
			}
		}
};

function completeVersion(addon) {
	Version.VERSION = addon.version;
	Version.BASE_VERSION = Version.VERSION.replace(/^([\d\w]+\.[\d\w]+).*?$/, '$1');
	Version.NAME = addon.name;
	Version.ready = true;
	
	_callbacks.forEach(function(c) c.call(c, Version));
	_callbacks = [];
}

/**
 * Compares two version literals according to mozilla rules
 * @param version (string) Optional. Version.  If not given extension version will be used.
 * @param cmp (string) Version to compare to.
 * @return nsIVersionComparator result
 */

try {
	// moz-1.9.3+
	module("resource://gre/modules/AddonManager.jsm");
	AddonManager.getAddonByID(Version.ID, function(addon) {
		completeVersion(addon);
	});
}
catch (ex) {
	Components.utils.reportError(ex);
	// moz-1.9.2-
	const ITEM = Cc["@mozilla.org/extensions/manager;1"].getService(Ci.nsIExtensionManager).getItemForID(ID);
	completeVersion(ITEM);
}