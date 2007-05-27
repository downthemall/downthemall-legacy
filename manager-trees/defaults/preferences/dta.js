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
 * The Original Code is the DownThemAll! preferences.
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
pref("extensions.dta.ctxmenu", "1,1,0");
pref("extensions.dta.ctxcompact", false);
pref("extensions.dta.toolsmenu", "1,1,1");
pref("extensions.dta.toolscompact", true);
pref("extensions.dta.closetab", false);
pref("extensions.dta.closedta", false);
pref("extensions.dta.saveTemp", true);
pref("extensions.dta.downloadWin", true);
pref("extensions.dta.existing", 3);
pref("extensions.dta.ntask", 4);
pref("extensions.dta.timeout", 300);
pref("extensions.dta.maxchunks", 4);
pref("extensions.dta.history", 5);
pref("extensions.dta.alertbox", 2);
pref("extensions.dta.removecompleted", true);
pref("extensions.dta.removecanceled", false);
pref("extensions.dta.removeaborted", false);
pref("extensions.dta.infophrases", true);
pref("extensions.dta.statistics", false); // later use!
pref("extensions.dta.logging", false);
pref("extensions.dta.showOnlyFilenames", true);
pref("extensions.dta.sounds.done", true);
pref("extensions.dta.sounds.error", false);
pref("extensions.dta.settime", true);
pref("extensions.dta.showtooltip", true);
pref("extensions.dta.renaming", "['*name*.*ext*', '*num*_*name*.*ext*', '*url*-*name*.*ext*', '*name* (*text*).*ext*', '*name* (*hh*-*mm*).*ext*']");
pref("extensions.dta.filter", "['', '/(\\.mp3)$/', '/(\\.(html|htm|rtf|doc|pdf))$/', 'http://www.website.com/subdir/*.*', 'http://www.website.com/subdir/pre*.???', '*.z??, *.css, *.html']");