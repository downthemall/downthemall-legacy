const DTA_ID = 'dta@downthemall.net';
const DTA_ITEM = Components.classes["@mozilla.org/extensions/manager;1"]
	.getService(Components.interfaces.nsIExtensionManager)
	.getItemForID(DTA_ID);
const DTA_VERSION = DTA_ITEM.version;
const DTA_NAME = DTA_ITEM.name;
