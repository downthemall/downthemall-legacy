const ID = 'dta@downthemall.net';
const ITEM = Components.classes["@mozilla.org/extensions/manager;1"]
	.getService(Components.interfaces.nsIExtensionManager)
	.getItemForID(ID);

const VERSION = ITEM.version;
const NAME = ITEM.name;

const EXPORTED_SYMBOLS = ['ID', 'ITEM', 'VERSION', 'NAME'];