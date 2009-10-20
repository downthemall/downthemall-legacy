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
const Cr = Components.results;
const ctor = Components.Constructor;
const module = Components.utils.import;
const error = Components.utils.reportError; 

module("resource://gre/modules/XPCOMUtils.jsm");

const FileStream = new ctor('@mozilla.org/network/file-output-stream;1', 'nsIFileOutputStream', 'init');
const ScriptError = new ctor('@mozilla.org/scripterror;1', 'nsIScriptError', 'init');

function DebugService() {
	this._pb.addObserver('extensions.dta.logging', this, true);
	this._setEnabled(this._pb.getBoolPref('extensions.dta.logging'));
	
	try {
		if (this._file.fileSize > (200 * 1024)) {
			this.remove();
		}
	}
	catch(ex) {
		// No-Op
	}
}
DebugService.prototype = {
	classDescription: "DownThemAll! Debug and Logging Service",
	contractID: "@downthemall.net/debug-service;1",
	classID: Components.ID("0B82FEBB-59A1-41d7-B31D-D5A686E11A69"),
	
	QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference, Ci.nsIWeakReference, Ci.dtaIDebugService]),
	
	QueryReferent: function(iid) this.QueryInterface(iid),
	GetWeakReference: function() this,
	
	// nsIObserver
	observe: function DS_observe(subject, topic, prefName) {
		this._setEnabled(this._pb.getBoolPref('extensions.dta.logging'));	
	},
	
	get _cs() {
		delete DebugService.prototype._cs;
		return (DebugService.prototype._cs = Cc['@mozilla.org/consoleservice;1'].getService(Ci.nsIConsoleService));
	},
	get _pb() {
		delete DebugService.prototype._pb;
		return (DebugService.prototype._pb = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefBranch2));
	},
	
	get _file() {
		let file = Cc["@mozilla.org/file/directory_service;1"]
			.getService(Ci.nsIProperties)
			.get("ProfD", Ci.nsILocalFile);
		 file.append('dta_log.txt');
		 delete DebugService.prototype._file;
		 return (DebugService.prototype._file = file);
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
	_log: function DS__log(msg, exception) {
		try {
			if (!msg || (msg == "" && typeof(exception) != "object")) {
				return;
			}
			if (!(msg instanceof String) && typeof(msg) != 'string') {
				for (var i = 0; i < 10 && msg.wrappedJSObject; ++i) {
					msg = msg.wrappedJSObject;
				}
				msg = msg.toSource();
			}
			let time = new Date();
			let text = [];
			text.push(this._formatTimeDate(time.getHours()));
			text.push(':');
			text.push(this._formatTimeDate(time.getMinutes()));
			text.push(':');
			text.push(this._formatTimeDate(time.getSeconds()));
			text.push('::');
			text.push(time.getMilliseconds());
			text.push('\n');

			if (msg != "") {
				text.push(msg.replace(/\n/g, "\n\t") + " ");
			}
			if (exception) {
				text.push("\tError: " + exception);
			}
			text.push('\n');
			let stack = Components.stack;
			if (stack) {
				stack = stack.caller.caller;
			}
			let lineNumber = 0;
			let columnNumber = 0;
			let fileName = null;
			let sourceLine = '';
			
			
			if (exception && exception.location) {
				lineNumber = exception.lineNumber;
				fileName = exception.filename;
				columnNumber = exception.columnNumber;
				stack = exception.location;

				let initialLine = "Source Frame :: " + fileName;
				initialLine += " :: " + exception.location;
				initialLine += " :: line: " + lineNumber;
				text.push('\t>');
				text.push(initialLine);
				text.push('\n');
			}
			else if (exception && exception.stack) {
				lineNumber = exception.lineNumber;
				fileName = exception.fileName;
				columnNumber = 0;
				let initialLine = "Source Frame (error) :: " + fileName;
				initialLine += " :: " + exception.name;
				initialLine += " :: line: " + lineNumber;
				text.push("\t>" + initialLine + "\n");
				
			}
			else if (exception && stack) {
				lineNumber = stack.lineNumber;
				fileName = stack.filename;
				let initialLine = "Source Frame (stack) :: " + fileName;
				initialLine += " :: " + stack.name;
				initialLine += " :: line: " + lineNumber;
				text.push('\t>');
				text.push(initialLine);
				text.push('\n');
			}
			else if (stack) {
				text.push('\t>');
				text.push(stack.toString());
				text.push('\n');
				lineNumber = stack.lineNumber;
				fileName = stack.filename;
			}
			
			if (stack instanceof Ci.nsIStackFrame) {
				let sourceLine = stack.sourceLine;
				let s = stack.caller;
				for (let i = 0; i < 4 && s; ++i) {
					text.push('\t>');
					text.push(s.toString());
					text.push('\n');
					s = s.caller;
				}
				text = text.join('');
				if (stack && exception) {
					this._cs.logMessage(new ScriptError(text, fileName, sourceLine, lineNumber, columnNumber, 0x2, 'component javascript'));
					 
				} 
				else {
					this._cs.logStringMessage(text);
				}
			}
			else {
				text = text.join('');
				this._cs.logStringMessage(text);
			}
			var f = new FileStream(this.file, 0x04 | 0x08 | 0x10, 0664, 0);
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
			throw Cr.NS_ERROR_FAILURE;
		}
	}
};

// entrypoint
function NSGetModule(compMgr, fileSpec) XPCOMUtils.generateModule([DebugService]);