const kSCHEME = "dta";
const kPROTOCOL_NAME = "DownThemAll protocol";
const kPROTOCOL_CONTRACTID = "@mozilla.org/network/protocol;1?name=" + kSCHEME;
const kPROTOCOL_CID = Components.ID("789409b9-2e3b-4682-a5d3-71ca80a76456");

// Mozilla defined
const kSIMPLEURI_CONTRACTID = "@mozilla.org/network/simple-uri;1";
const kIOSERVICE_CONTRACTID = "@mozilla.org/network/io-service;1";
const nsISupports = Components.interfaces.nsISupports;
const nsIIOService = Components.interfaces.nsIIOService;
const nsIProtocolHandler = Components.interfaces.nsIProtocolHandler;
const nsIURI = Components.interfaces.nsIURI;

var windowMediator = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);

function Protocol()
{
}

Protocol.prototype =
{
  QueryInterface: function(iid)
  {
    if (!iid.equals(nsIProtocolHandler) &&
        !iid.equals(nsISupports))
      throw Components.results.NS_ERROR_NO_INTERFACE;
    return this;
  },

  scheme: kSCHEME,
  defaultPort: -1,
  protocolFlags: nsIProtocolHandler.URI_NORELATIVE |
                 nsIProtocolHandler.URI_NOAUTH,
  
  allowPort: function(port, scheme)
  {
    return false;
  },

  newURI: function(spec, charset, baseURI)
  {
    var uri = Components.classes[kSIMPLEURI_CONTRACTID].createInstance(nsIURI);
    uri.spec = spec;
    return uri;
  },

  newChannel: function(aURI)
  {
		// aURI is a nsIUri, so get a string from it using .spec
	   var url = aURI.spec;

      return {
			contentLength: 0,
			owner: null,
			securityInfo: null,
			notificationCallbacks: null,
			loadFlags: 0,
			loadGroup: null,
			name: null,
			status: Components.results.NS_OK,
			open: function() {
				var browser = windowMediator.getMostRecentWindow("navigator:browser");
				
				var obj = {
					desc: "",
					url: "",
					ref: "",
					mask: ""
				}

				var vars = url.replace(/^dta:\/*/, "").split(";");
				for (var i=0; i < vars.length; i++) {
					if (/^url=/i.test(vars[i])) {
						obj.url = vars[i].replace(/^url=/i, "");
					}
					if (/^description=/i.test(vars[i])) {
						obj.desc = vars[i].replace(/^description=/i, "");
					}
					if (/^referrer=/i.test(vars[i])) {
						obj.ref = vars[i].replace(/^referrer=/i, "");
					}
					if (/^mask=/i.test(vars[i])) {
						obj.mask = vars[i].replace(/^mask=/i, "");
					}
				}
				
				if (browser) {
					browser.DTA_AddingFunctions.saveSingleLink(
						false,
						obj.url,
						obj.ref,
						obj.desc,
						obj.mask
					);
				}
				return Components.results.NS_ERROR_NO_CONTENT;
			},
			asyncOpen: function() {
				return this.open();
			},
			isPending: function() {
				return false
			},
			cancel: function(status) {
				this.status = status;
			},
			suspend: function() {
				throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
			},
			resume: function() {
				throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
			},
			QueryInterface: function(iid) {
				if (iid.equals(Components.interfaces.nsIChannel) ||
						iid.equals(Components.interfaces.nsIRequest) ||
						iid.equals(Components.interfaces.nsISupports))
					return this; 

				throw Components.results.NS_ERROR_NO_INTERFACE;
			}
		};
  }
}

var ProtocolFactory = new Object();

ProtocolFactory.createInstance = function (outer, iid)
{
  if (outer != null)
    throw Components.results.NS_ERROR_NO_AGGREGATION;

  if (!iid.equals(nsIProtocolHandler) &&
      !iid.equals(nsISupports))
    throw Components.results.NS_ERROR_NO_INTERFACE;

  return new Protocol();
}


/**
 * JS XPCOM component registration goop:
 *
 * We set ourselves up to observe the xpcom-startup category.  This provides
 * us with a starting point.
 */

var TestModule = new Object();

TestModule.registerSelf = function (compMgr, fileSpec, location, type)
{
  compMgr = compMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar);
  compMgr.registerFactoryLocation(kPROTOCOL_CID,
                                  kPROTOCOL_NAME,
                                  kPROTOCOL_CONTRACTID,
                                  fileSpec, 
                                  location, 
                                  type);
}

TestModule.getClassObject = function (compMgr, cid, iid)
{
  if (!cid.equals(kPROTOCOL_CID))
    throw Components.results.NS_ERROR_NO_INTERFACE;

  if (!iid.equals(Components.interfaces.nsIFactory))
    throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
    
  return ProtocolFactory;
}

TestModule.canUnload = function (compMgr)
{
  return true;
}

function NSGetModule(compMgr, fileSpec)
{
  return TestModule;
}