/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 *
 * Written by Nils Maier in 2011 as part of DownThemAll!
 */

"use strict";

const EXPORTED_SYMBOLS = [
	"XPCOMUtils", "Services", "Instances"
	];

const {classes: Cc, interfaces: Ci, utils: Cu, Constructor: ctor} = Components;
const module = Cu.import;

module("resource://gre/modules/XPCOMUtils.jsm");

function Services() {}
module("resource://gre/modules/Services.jsm", Services);
Services.prototype = Services.Services;
delete Services.Services;
Services = new Services();

XPCOMUtils.defineLazyServiceGetter(Services, "catman", "@mozilla.org/categorymanager;1", "nsICategoryManager");
XPCOMUtils.defineLazyServiceGetter(Services, "clipbrd", "@mozilla.org/widget/clipboard;1", "nsIClipboard");
XPCOMUtils.defineLazyServiceGetter(Services, "drags", "@mozilla.org/widget/dragservice;1", "nsIDragService");
XPCOMUtils.defineLazyServiceGetter(Services, "eps", "@mozilla.org/uriloader/external-protocol-service;1", "nsIExternalProtocolService");
XPCOMUtils.defineLazyServiceGetter(Services, "fixups", "@mozilla.org/docshell/urifixup;1", "nsIURIFixup");
XPCOMUtils.defineLazyServiceGetter(Services, "favicons", "@mozilla.org/browser/favicon-service;1", "nsIFaviconService");
XPCOMUtils.defineLazyServiceGetter(Services, "httphandler", "@mozilla.org/network/protocol;1?name=http", "nsIHttpProtocolHandler");
XPCOMUtils.defineLazyServiceGetter(Services, "memrm", "@mozilla.org/memory-reporter-manager;1", "nsIMemoryReporterManager");
XPCOMUtils.defineLazyServiceGetter(Services, "mime", "@mozilla.org/uriloader/external-helper-app-service;1", "nsIMIMEService");
XPCOMUtils.defineLazyServiceGetter(Services, "mimeheader", "@mozilla.org/network/mime-hdrparam;1", "nsIMIMEHeaderParam");
XPCOMUtils.defineLazyServiceGetter(Services, "ttsu", "@mozilla.org/intl/texttosuburi;1", "nsITextToSubURI");
XPCOMUtils.defineLazyServiceGetter(Services, "uuid", "@mozilla.org/uuid-generator;1", "nsIUUIDGenerator");
XPCOMUtils.defineLazyServiceGetter(Services, "wintaskbar", "@mozilla.org/windows-taskbar;1", "nsIWinTaskbar");

const Instances = {};
function itor(name, cls, iface, init) {
	if (init) {
		XPCOMUtils.defineLazyGetter(Instances, name, function() ctor(cls, iface, init));
		XPCOMUtils.defineLazyGetter(Instances, "Plain" + name, function() ctor(cls, iface));
	}
	else {
		XPCOMUtils.defineLazyGetter(Instances, name, function() ctor(cls, iface));
		XPCOMUtils.defineLazyGetter(Instances, name.toLowerCase(), function() new this[name]());
	}
}

// non-init
itor("XHR", "@mozilla.org/xmlextras/xmlhttprequest;1", "nsIXMLHttpRequest");
itor("DOMSerializer", "@mozilla.org/xmlextras/xmlserializer;1", "nsIDOMSerializer");
itor("MimeInputStream", "@mozilla.org/network/mime-input-stream;1", "nsIMIMEInputStream");
itor("SupportsUint32","@mozilla.org/supports-PRUint32;1", "nsISupportsPRUint32");
itor("Transferable", "@mozilla.org/widget/transferable;1", "nsITransferable");
itor("UniConverter", "@mozilla.org/intl/scriptableunicodeconverter", "nsIScriptableUnicodeConverter");

// init
itor("AsyncStreamCopier", "@mozilla.org/network/async-stream-copier;1","nsIAsyncStreamCopier", "init");
itor("BinaryInputStream", "@mozilla.org/binaryinputstream;1", "nsIBinaryInputStream", "setInputStream");
itor("BinaryOutputStream", "@mozilla.org/binaryoutputstream;1", "nsIBinaryOutputStream", "setOutputStream");
itor("BufferedOutputStream", "@mozilla.org/network/buffered-output-stream;1", "nsIBufferedOutputStream", "init");
itor("ConverterOutputStream", "@mozilla.org/intl/converter-output-stream;1", "nsIConverterOutputStream", "init");
itor("FileInputStream", "@mozilla.org/network/file-input-stream;1", "nsIFileInputStream", "init");
itor("FileOutputStream", "@mozilla.org/network/file-output-stream;1", "nsIFileOutputStream", "init");
itor("FilePicker", "@mozilla.org/filepicker;1", "nsIFilePicker", "init");
itor("Hash", "@mozilla.org/security/hash;1", "nsICryptoHash", "init");
itor("LocalFile", "@mozilla.org/file/local;1", "nsILocalFile", "initWithPath");
itor("Pipe", "@mozilla.org/pipe;1", "nsIPipe", "init");
itor("Process", "@mozilla.org/process/util;1", "nsIProcess", "init");
itor("Sound", "@mozilla.org/sound;1", "nsISound", "play");
itor("ScriptableInputStream", "@mozilla.org/scriptableinputstream;1", "nsIScriptableInputStream", "init");
itor("ScriptError", "@mozilla.org/scripterror;1", "nsIScriptError", "init");
itor("StringInputStream", "@mozilla.org/io/string-input-stream;1", "nsIStringInputStream", "setData");
itor("Timer", "@mozilla.org/timer;1", "nsITimer", "init");
itor("ZipReader", "@mozilla.org/libjar/zip-reader;1", "nsIZipReader", "open");
