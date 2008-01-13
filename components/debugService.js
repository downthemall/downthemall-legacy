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
 * The Original Code is DownThemAll! Debug Service.
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
const res = Components.results;
const FileStream = new Components.Constructor('@mozilla.org/network/file-output-stream;1', 'nsIFileOutputStream', 'init');
const ScriptError = new Components.Constructor('@mozilla.org/scripterror;1', 'nsIScriptError', 'init');
 
var DebugService = {
	// nsIClassInfo
	classID: Components.ID("{0B82FEBB-59A1-41d7-B31D-D5A686E11A69}"),
	contractID: "@downthemall.net/debug-service;1",
	classDescription: "DownThemAll! Debug Service",
	implementationLanguage: 0x02,
	flags: (1 << 0) | (1 << 2), // SINGLETON | MAIN_THREAD_ONLY
	classIDNoAlloc: this.classID,
	getHelperForLanguage: function() {
		return null;
	},
	getInterfaces: function(count) {
		// XXX
		count.value = 0;
		return null;
	},

	implementsIID: function DS_implementID(iid) {
			return [
				Ci.nsISupports,
				Ci.nsISupportsWeakReference,
				Ci.nsIWeakReference,
				Ci.nsIObserver,
				Ci.nsIClassInfo,
				Ci.nsIFactory,
				Ci.dtaIDebugService
			].some(function(e) { return iid.equals(e); });
	},
	// nsiSupports
	QueryInterface: function DS_QI(iid) {
		if (this.implementsIID(iid)) {
			return this;
		}
		throw res.NS_ERROR_NO_INTERFACE;
	},

	// nsiWeakReference
	QueryReferent: function DS_QR(iid) {
		return this;
	},

	// nsiSupportsWeakReference
	GetWeakReference: function DS_GWR() {
		return this;
	},

	// nsIFactory
	createInstance: function (outer, iid) {
		if (outer != null) {
			throw res.NS_ERROR_NO_AGGREGATION;
		}
		if (this.implementsIID(iid)) {
			this._init();		
			return this;
		}
		throw res.NS_ERROR_INVALID_ARG;
	},

	// nsIObserver
	observe: function DS_observe(subject, topic, prefName) {
		this._setEnabled(this._pb.getBoolPref('extensions.dta.logging'));	
	},
	
	_init: function DS__init() {
		this._cs = Cc['@mozilla.org/consoleservice;1'].getService(Ci.nsIConsoleService);
		this._pb = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefBranch2);
		this._pb.addObserver('extensions.dta.logging', this, true);
		this._setEnabled(this._pb.getBoolPref('extensions.dta.logging'));
		
		this._file = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties).get("ProfD", Ci.nsILocalFile);
		this._file.append('dta_log.txt');
		
		try {
			if (this._file.fileSize > (200 * 1024)) {
				this.remove();
			}
		}
		catch(ex) {
			// No-Op
		}
		this._init = new Function();
	},
	get file() {
		return this._file;
	},
	get enabled() {
		return this._enabled;
	},
	_setEnabled: function DS_setEnabled(nv) {
		this._enabled = nv;
		if (nv) {
			this.logString = this.log = this._log;
		}
		else {
			this.logString = this.log = this._logDisabled;
		}
	},
	_formatTimeDate: function DS_formatTimeDate(value) {
		return String(value).replace(/\b(\d)\b/g, "0$1");
	},
	_log: function DS__dump(msg, e) {
		try {
			if (msg == "" && typeof(e) != "object") {
				return;
			}
			if (!(msg instanceof String) && typeof(msg) != 'string') {
				for (var i = 0; i < 10 && msg.wrappedJSObject; ++i) {
					msg = msg.wrappedJSObject;
				}
				msg = msg.toSource();
			}
			var time = new Date();
			var text = this._formatTimeDate(time.getHours())
				+ ":" + this._formatTimeDate(time.getMinutes())
				+ ":" + this._formatTimeDate(time.getSeconds())
				+ ":" + time.getMilliseconds()
				+ "\n";

			if (msg != "") {
				text += msg.replace(/\n/g, "\n\t") + " ";
			}
			if (e) {
				text += "\tError: " + e;
			}
			text += "\r\n";
			if (Components.stack) {
				var stack = Components.stack.caller.caller;

				for (var i = 0; i < 4 && stack; ++i) {
					text += "\t> " + stack.toString() + "\n";
					stack = stack.caller;
				}
				stack = Components.stack.caller.caller;
				if (stack && e) {
					this._cs.logMessage(new ScriptError(text, stack.filename, null, stack.lineNumber, 0, 0x2, 'component javascript'));
					 
				} 
				else {
					this._cs.logStringMessage(text);
				}
			}
			else {
				this._cs.logStringMessage(text);
			}
			
			var f = new FileStream(this._file, 0x04 | 0x08 | 0x10, 0664, 0);
			f.write(text, text.length);
			f.close();
		}
		catch(ex) {
			error(ex);
		}	
	
	},
	_logDisabled: function DS__dumpDisabled() {
		// no-op;
	},
	log: this._log,
	logString: this._log,
		
	remove: function DS_remove() {
		try {
			this._file.remove(false);
		}
		catch (ex) {
			throw res.NS_ERROR_FAILURE;
		}
	},

	_firstTime: true,
	registerSelf: function DS_registerSelf(compMgr, fileSpec, location, type) {
		try {
			error("registering");
			
			if (!this._firstTime) {
				return;
			}
			this._firstTime = false;
	
			compMgr.QueryInterface(Ci.nsIComponentRegistrar)
				.registerFactoryLocation(
					this.classID,
					this.classDescription,
					this.contractID,
					fileSpec,
					location,
					type
				);
		}
		catch (ex) {
			error(ex);
		}
	},
	unregisterSelf: function DS_unregisterSelf(compMgr, fileSpec, location) {
		compMgr.QueryInterface(Ci.nsIComponentRegistrar)
			.unregisterFactoryLocation(
				this.classID,
				fileSpec
			);
	},
	getClassObject: function DS_getClassObject(compMgr, cid, iid) {
		if (cid.equals(this.classID)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	},
	canUnload: function DS_canUnload(compMgr) {
		return true;
	}
};

// entrypoint
function NSGetModule(compMgr, fileSpec) {
	return DebugService;
}