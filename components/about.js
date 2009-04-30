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
 * The Original Code is DownThemAll! About module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2009
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
const log = Components.utils.reportError;

// URI to the chrome part
const REAL_URI = 'http://code.downthemall.net/about/%BASE_VERSION%/?locale=%LOCALE%&app=%APP_NAME%&version=%APP_VERSION%';

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

function AboutDta() {}
AboutDta.prototype = {
	classDescription: "DownThemAll! about module",
	classID: Components.ID('bbaedbd9-9567-4d11-9255-0bbae236ecab'),
	contractID: '@mozilla.org/network/protocol/about;1?what=downthemall',
	
	QueryInterface: XPCOMUtils.generateQI([Ci.nsIAboutModule]),
	
    newChannel : function(aURI) {
		try {
		    let io = Cc['@mozilla.org/network/io-service;1'].getService(Ci.nsIIOService);
		    let sec = Cc['@mozilla.org/scriptsecuritymanager;1'].getService(Ci.nsIScriptSecurityManager);
		    
		    let version = {};
		    Components.utils.import('resource://dta/version.jsm', version);
		    
		    let ru = REAL_URI.replace(
		    	/%(.+?)%/g,
		    	function (m, m1) (m1 in version) ? version[m1] : m
		    );
		    
		    let uri = io.newURI(ru, null, null);
		    let chan = io.newChannelFromURI(uri);
		    chan.originalURI = aURI;
		    chan.owner = sec.getCodebasePrincipal(uri);
		    
		    return chan;
		}
		catch (ex) {
			log(ex);
			throw ex;
		}
	},
	
	getURIFlags: function(aURI) {
	    return Ci.nsIAboutModule.URI_SAFE_FOR_UNTRUSTED_CONTENT;
	}	
}


function NSGetModule(aCompMgr, aFileSpec) XPCOMUtils.generateModule([AboutDta]);
