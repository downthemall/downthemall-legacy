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
 * The Original Code is the DownThemAll! Privacy component.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2006
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


const CONTRACTID = "@downthemall.net/privacycontrol;1";
const CID = Components.ID("{db7a8d60-a4c7-11da-a746-0800200c9a66}");

// we support these interfaces.
const IIDs = [
  Components.interfaces.nsISupports,
  Components.interfaces.nsIObserver,
  CID
];

// helper : check if interface is supported
function testIID(aIID)
{
  for (var i = 0; i < IIDs.length; ++i) {
    if (aIID.equals(IIDs[i]))
      return true;
  }
  return false;
}


// c'tor
function privacycontrol() {
  this.initialize();
}

privacycontrol.prototype = {

  _logService: null,

  QueryInterface: function(aIID) {

    if (testIID(aIID))
      return this;

    throw Components.results.NS_ERROR_NO_INTERFACE;
  },

  initialize: function() {

    this._logService = Components.classes["@mozilla.org/consoleservice;1"]
      .getService(Components.interfaces.nsIConsoleService);

    // install required observers, so that we may process on shutdown
    const os = Components.classes['@mozilla.org/observer-service;1']
      .getService(Components.interfaces.nsIObserverService);
    os.addObserver(this, 'profile-change-teardown', false);
    os.addObserver(this, 'xpcom-shutdown', false);
  },

  log : function(aMsg) {
		Components.utils.reportError('dta privacyControl: ' + aMsg);
  },

  dispose: function () {

    // always remove observers ;)
    const os = Components.classes['@mozilla.org/observer-service;1']
      .getService(Components.interfaces.nsIObserverService);
    os.removeObserver(this, 'profile-change-teardown');
    os.removeObserver(this, 'xpcom-shutdown');
  },

  observe: function(subject, topic, data) {

    switch (topic) {

    case 'xpcom-shutdown':
      this.dispose();
    break;

    case 'profile-change-teardown':
      this.onShutdown();
    break;

    case 'sanitize':
      this.sanitize();
    break;

    case 'clean':
      this.clean();
    break;

    }
  },

  clean: function() {

    this.log('clean()');
    const prefs = Components.classes["@mozilla.org/preferences-service;1"]
      .getService(Components.interfaces.nsIPrefService)
      .getBranch('extensions.dta.');
		['directory', 'filter', 'renaming'].forEach(function(e) { prefs.clearUserPref(e); });

		try {
			var prof = Components.classes["@mozilla.org/file/directory_service;1"]
				.getService(Components.interfaces.nsIProperties)
				.get("ProfD", Components.interfaces.nsIFile);
			['dta_history.xml', 'dta_log.txt'].forEach(
				function (e) {
					try {
						var file = prof.clone();
						file.append(e);
						if (file.exists()) {
							file.remove();
						}
					} catch (ex) {
						this.log('cannot remove ' + e);
					}
				}
			);
		}
		catch (oex) {
			this.log('failed to clean files');
		}
  },

  sanitize: function() {

    this.log('sanitize()');
    const prefs = Components.classes["@mozilla.org/preferences-service;1"]
      .getService(Components.interfaces.nsIPrefService)
      .getBranch('privacy.');

    // in case UI should be used the cleaning will be processed there.
    // Futhermore we have to ensure user wants us to sanitize.
    if (!prefs.getBoolPref('sanitize.promptOnSanitize') && prefs.getBoolPref('item.extensions-dta'))
      this.clean(prefs);

  },

  onShutdown : function()
  {
    this.log('onShutdown()');
    const prefs = Components.classes["@mozilla.org/preferences-service;1"]
      .getService(Components.interfaces.nsIPrefService)
      .getBranch('privacy.');

    // has user pref'ed to sanitize on shutdown?
    if (prefs.getBoolPref('sanitize.sanitizeOnShutdown'))
      this.sanitize();

  }

}

// little factory.
const factory = {
  instance: null,

  QueryInterace : function(aIID) {
    if (aIID.equals(Components.interfaces.nsIFactory) || aIID.equals(Components.interfaces.nsIFactory))
      return this;

    return Components.results.NS_ERROR_NO_INTERFACE;
  },

  createInstance: function(aOuter, aIID)
  {
    if (aOuter != null)
      throw Components.results.NS_ERROR_NO_AGGREGATION;

    // alright. we want a singleton!
    if (testIID(aIID))
      return this.instance ? this.instance : (this.instance = new privacycontrol());

    throw Components.results.NS_ERROR_INVALID_ARG;

  }
};

const module = {

  regged: false,

  registerSelf: function(mgr, spec, location, type) {

    // reg only once.
    if (this.regged)
      return;
    this.regged = true;

    mgr.QueryInterface(Components.interfaces.nsIComponentRegistrar)
      .registerFactoryLocation(
        CID,
        'downTHEMall Privacy Control',
        CONTRACTID,
        spec,
        location,
        type
    );

    // this will create the initial instance, which will install the observers
    Components.classes['@mozilla.org/categorymanager;1']
      .getService(Components.interfaces.nsICategoryManager)
      .addCategoryEntry('app-startup', CONTRACTID, CONTRACTID, true, true, null);

  },

  unregisterSelf: function(mgr, spec, location) {

    if (!this.regged)
      return;

    mgr.QueryInterface(Components.interfaces.nsIComponentRegistrar)
      .unregisterFactoryLocation(CID, spec);

    Components.classes['@mozilla.org/categorymanager;1']
      .getService(Components.interfaces.nsICategoryManager)
      .deleteCategoryEntry('app-startup', CONTRACTID, true);

  },

  getClassObject: function(mgr, cid, iid)
  {
    if (!cid.equals(CID))
      throw Components.results.NS_NO_INTERFACE;

    if (!iid.equals(Components.interfaces.nsIFactory))
      throw Components.results.NS_NOT_IMPLEMENTED;

    return factory;
  }
};

function NSGetModule(mgr, spec) {
	dump("PC getModule");
  return module;
}
