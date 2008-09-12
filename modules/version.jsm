const EXPORTED_SYMBOLS = ['ID', 'ITEM', 'VERSION', 'NAME', 'compareVersion'];

const ID = 'dta@downthemall.net';
const ITEM = Components.classes["@mozilla.org/extensions/manager;1"]
	.getService(Components.interfaces.nsIExtensionManager)
	.getItemForID(ID);

const VERSION = ITEM.version;
const NAME = ITEM.name;

const comparator = 
	Components.classes['@mozilla.org/xpcom/version-comparator;1']
	.getService(Components.interfaces.nsIVersionComparator);

function compareVersion(version, cmp) {
	if (!cmp) {
		[version, cmp] = [VERSION, version];
	}
	cmp = cmp.replace(/^(\d+\.\d+).*$/, '$1');
	return comparator.compare(version, cmp);
}