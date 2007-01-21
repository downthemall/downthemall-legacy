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
 * The Original Code is the downTHEMall preferences.
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
pref("extensions.dta.filters.deffilter0.label", "All files");
pref("extensions.dta.filters.deffilter0.test", ".*");
pref("extensions.dta.filters.deffilter0.regex", true);
pref("extensions.dta.filters.deffilter0.active", false);
pref("extensions.dta.filters.deffilter0.type", 3);

pref("extensions.dta.filters.deffilter1.label", "Archives (zip, rar..)");
pref("extensions.dta.filters.deffilter1.test", "/\\.(z(ip|[0-9]{2})|r(ar|[0-9]{2})|jar|bz2|gz|tar|rpm)$/");
pref("extensions.dta.filters.deffilter1.regex", true);
pref("extensions.dta.filters.deffilter1.active", false);
pref("extensions.dta.filters.deffilter1.type", 1);

pref("extensions.dta.filters.deffilter2.label", "Videos (mpeg, avi, wmv..)");
pref("extensions.dta.filters.deffilter2.test", "/\\.(mpeg|rm|mpe|avi|mpg|mp4|mov|divx|asf|qt|wmv|ram|m1v|m2v|rv|vob|asx)$/");
pref("extensions.dta.filters.deffilter2.regex", true);
pref("extensions.dta.filters.deffilter2.active", true);
pref("extensions.dta.filters.deffilter2.type", 3);

pref("extensions.dta.filters.deffilter3.label", "Images (gif, jpg, png..)");
pref("extensions.dta.filters.deffilter3.test", "/\\.(jp(e?g|e|2)|gif|png|tif|tiff|bmp|ico)$/");
pref("extensions.dta.filters.deffilter3.regex", true);
pref("extensions.dta.filters.deffilter3.active", true);
pref("extensions.dta.filters.deffilter3.type", 3);

pref("extensions.dta.filters.deffilter4.label", "JPEG");
pref("extensions.dta.filters.deffilter4.test", "/\\.jp(e?g|e|2)$/");
pref("extensions.dta.filters.deffilter4.regex", true);
pref("extensions.dta.filters.deffilter4.active", false);
pref("extensions.dta.filters.deffilter4.type", 3);
