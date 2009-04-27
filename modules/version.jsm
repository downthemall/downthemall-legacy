const EXPORTED_SYMBOLS = [
	'ID', 'ITEM', 'VERSION', 'BASE_VERSION', 'NAME',
	'LOCALE', 'APP_NAME', 'APP_VERSION',
	'compareVersion'
];

const Cc = Components.classes;
const Ci = Components.interfaces;

const ID = 'dta@downthemall.net';
const ITEM = Cc["@mozilla.org/extensions/manager;1"].getService(Ci.nsIExtensionManager).getItemForID(ID);
const LOCALE = Cc["@mozilla.org/chrome/chrome-registry;1"].getService(Ci.nsIXULChromeRegistry).getSelectedLocale('global');
const runtime = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo).QueryInterface(Ci.nsIXULRuntime);
const APP_NAME = runtime.name.toLowerCase().replace(/ /, '');
const APP_VERSION = runtime.version;


const VERSION = ITEM.version;
const BASE_VERSION = VERSION.replace(/^([\d\w]+\.[\d\w]+).*?$/, '$1');
const NAME = ITEM.name;

const comparator = 
	Components.classes['@mozilla.org/xpcom/version-comparator;1']
	.getService(Components.interfaces.nsIVersionComparator);

function compareVersion(version, cmp) {
	if (!cmp) {
		[version, cmp] = [VERSION, version];
	}
	return comparator.compare(version, cmp);
}