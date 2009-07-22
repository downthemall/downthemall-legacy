/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is DownThemAll! Module Helpers
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2008
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Nils Maier <MaierMan@web.de>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

const Cc = Components.classes;
const Ci = Components.interfaces;
const error = Components.utils.reportError;
const Cr = Components.results;
const importModule = Components.utils.import;

// XXX Deprecated

function debug(str, ex) {
	try {
		var _debugServ = Components.classes['@downthemall.net/debug-service;1']
			.getService(Components.interfaces.dtaIDebugService);
		debug = function(str, ex) {
			if (ex) {
				_debugServ.log(str, ex);
			}
			else {
				_debugServ.logString(str);
			}
		}
		debug(str, ex);
	}
	catch (ex) {
		error(str + ": " + ex);
	}
}

function implementComponent(obj, classID, contractID, description, interfaces) {
	[
		Ci.nsISupports,
		Ci.nsIClassInfo,
		Ci.nsISupportsWeakReference,
		Ci.nsIWeakReference,
	].forEach(
		function(i) {
			if (interfaces.indexOf(i) == -1) {
				interfaces.push(i);
			}
		}
	);
	obj.interfaces = interfaces;
	
	// implement me
	obj.classID = classID;
	obj.classIDNoAlloc = obj.classID;
	obj.classDescription = description;
	obj.contractID = contractID;
	
	obj.implementationLanguage = Ci.nsIProgrammingLanguage.JAVASCRIPT;
	obj.flags = Ci.nsIClassInfo.MAIN_THREAD_ONLY;
	obj.getHelperForLanguage = function() {
		return null;
	};
	obj.getInterfaces = function(count) {
		count.value = this.interfaces.length;
		return this.interfaces;
	};
	obj.implementsIID = function(iid) {
			return this.interfaces.some(function(e) { return iid.equals(e); });
	};
	obj.QueryInterface = function(iid) {
		if (this.implementsIID(iid)) {
			return this;
		}
		throw Cr.NS_ERROR_NO_INTERFACE;
	};
	obj.QueryReferent = function(iid) {
		return this.QueryInterface(iid);
	};
	obj.GetWeakReference = function() {
		return this;
	};	
} 

function ServiceModule(service, appStartup) {
	this._service = service;
	this._appStartup = appStartup;
};

ServiceModule.prototype = {
	_firstTime: true,

	registerSelf: function M_registerSelf(compMgr, fileSpec, location, type) {
		if (!this._firstTime) {
			return;
		}
		this._firstTime = false;

		compMgr.QueryInterface(Ci.nsIComponentRegistrar)
			.registerFactoryLocation(
				this._service.classID,
				this._service.classDescription,
				this._service.contractID,
				fileSpec,
				location,
				type
			);
		if (this._appStartup) {
			Cc['@mozilla.org/categorymanager;1']
				.getService(Ci.nsICategoryManager)
				.addCategoryEntry(
					'app-startup',
					this._service.contractID,
					this._service.contractID,
					true,
					true,
					null
				);
		}
	},
	unregisterSelf: function(compMgr, fileSpec, location) {
		compMgr.QueryInterface(Ci.nsIComponentRegistrar)
			.unregisterFactoryLocation(
				this._service.classID,
				fileSpec
			);
		if (this._appStartup) {
			Cc['@mozilla.org/categorymanager;1']
			.getService(Ci.nsICategoryManager)
			.deleteCategoryEntry(
				'app-startup',
				this._service.contractID,
				true
			);
		}
	},
	getClassObject: function (compMgr, cid, iid) {
		if (cid.equals(this._service.classID)) {
			return this;
		}
		throw Cr.NS_ERROR_NO_INTERFACE;
	},
	canUnload: function(compMgr) {
		return true;
	},

	// nsIFactory
	QueryInterface : function(aIID) {
		if (aIID.equals(Ci.nsIFactory)) {
			return this;
		}

		return Cr.NS_ERROR_NO_INTERFACE;
	},
	createInstance: function (outer, iid) {
		if (outer != null) {
			throw Cr.NS_ERROR_NO_AGGREGATION;
		}
		if ('init' in this._service) {
			this._service.init();
		}
		return this._service.QueryInterface(iid);
	}
};
