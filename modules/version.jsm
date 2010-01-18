const EXPORTED_SYMBOLS = [
	'ID', 'ITEM', 'VERSION', 'BASE_VERSION', 'NAME',
	'LOCALE', 'APP_NAME', 'APP_VERSION',
	'compareVersion'
];

const Cc = Components.classes;
const Ci = Components.interfaces;
const module = Components.utils.import;

module("resource://dta/utils.jsm");

// Extension id
const ID = 'dta@downthemall.net';
// Extension nsIExtension item
const ITEM = Cc["@mozilla.org/extensions/manager;1"].getService(Ci.nsIExtensionManager).getItemForID(ID);
// Global locale
const LOCALE = Cc["@mozilla.org/chrome/chrome-registry;1"].getService(Ci.nsIXULChromeRegistry).getSelectedLocale('global');
// XUL Runtime 
const runtime = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo).QueryInterface(Ci.nsIXULRuntime);

// Application 
const APP_NAME = runtime.name.toLowerCase().replace(/ /, '');
// Application version
const APP_VERSION = runtime.version;

// Extension version
const VERSION = ITEM.version;
// Extension major version
const BASE_VERSION = VERSION.replace(/^([\d\w]+\.[\d\w]+).*?$/, '$1');
// Application name
const NAME = ITEM.name;

ServiceGetter(this, "comparator", "@mozilla.org/xpcom/version-comparator;1", "nsIVersionComparator");

/**
 * Compares two version literals according to mozilla rules
 * @param version (string) Optional. Version.  If not given extension version will be used.
 * @param cmp (string) Version to compare to.
 * @return nsIVersionComparator result
 */
function compareVersion(version, cmp) {
	if (!cmp) {
		[version, cmp] = [VERSION, version];
	}
	return comparator.compare(version, cmp);
}