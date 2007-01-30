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
 * The Original Code is downTHEMall.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2007
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

var strbundle;

function Tree(links, type) {
	this._type = type;
	this._links = [];
	for (x in links) {
		if (x == 'length') {
			continue;
		}
		var link = links[x];
		link.__defineGetter__('icon', function() { if (!this._icon) { this._icon = getIcon(this.url, 'metalink' in this); } return this._icon; });
		link.checked = '';
		link.mask = null;
		if ('metalink' in link) {
			this._links.unshift(link);
		} else {
			this._links.push(link);
		}
	}
	this._iconic = this._as.getAtom('iconic');
}
Tree.prototype = {
	_as: Components.classes["@mozilla.org/atom-service;1"]
		.getService(Components.interfaces.nsIAtomService),
	
	get type() {
		return this._type;
	},
	get rowCount() {
		return this._links.length;
	},
	setTree: function(box) {
		this._box = box;
	},
	getParentIndex: function(idx) {
		return -1;
	},
	getLevel: function(idx) {
		return 0;
	},
	getCellText: function(idx, col) {
		var l = this._links[idx];
		switch (col.index) {
			case 1: return l.url.usable;
			case 2: {
				var t = "";
				if ("description" in l && l.description.length > 0)
					t += l.description;
				if ("ultDescription" in l && l.ultDescription.length > 0)
					t += ((t.length > 0) ? ' - ' : '') + l.ultDescription;
				return t;
			}
			case 3: return l.mask ? l.mask : strbundle.getString('default');
		}
		return null;
	},
	isSorted: function() {
		return false;
	},
	isContainer: function(idx) {
		return false;
	},
	isContainerOpen: function(idx) {
		return false;
	},
	isContainerEmpty: function(idx) {
		return false;
	},
	isSeparator: function(idx) {
		return false;
	},	
	isEditable: function(idx) {
		return true;
	},	
  getImageSrc: function(idx, col) {
		var l = this._links[idx];
		switch (col.index) {
			case 1: return l.icon;
		}
		return null;
	},
  getProgressMode : function(idx,column) {},
  getCellValue: function(idx, column) {
		return this._links[idx].checked.length ? "true" : "false";
	},
  cycleHeader: function(col, elem) {},
  selectionChanged: function() {},
  cycleCell: function(idx, column) {},
  performAction: function(action) {},
	performActionOnRow: function(action, index, column) {},
  performActionOnCell: function(action, index, column) {},
  getRowProperties: function(idx, prop) {
		var l = this._links[idx];
		prop.AppendElement(this._as.getAtom(l.checked));
	},
	getCellProperties: function(idx, column, prop) {
		if (column.index == 1) {
			prop.AppendElement(this._iconic);
		}
	},
  getColumnProperties: function(column, element, prop) {},
	setCellValue: function(idx, col, value) {
		var l = this._links[idx];
		if (value == "true") {
			l.checked = "manuallySelected";
			l.manuallyChecked = true;
		} else {
			l.checked = '';
			l.manuallySelected = false;
		}
		if (col) {
			this.invalidate();
		}
	},
	invalidate: function() {
		if (this._box) {
			this._box.invalidate();
		}
		var sel = 0;
		for (var i = 0; i < this.rowCount; ++i) {
			if (this._links[i].checked.length) {
				++sel;
			}
		}
		if (sel) {
			$("status").label = strbundle.getFormattedString("selel", [sel, this.rowCount]);
		} else {
			$("status").label = strbundle.getString("status");
		}
	}
};

function downloadElement(url, dir, num, desc1, desc2, mask, refPage) {
	this.url = url;
	this.dirSave = dir;	
	this.numIstance = num;
	this.description = desc1;
	this.ultDescription = desc2;
	this.refPage = refPage;
	this.mask = mask;
}


var Dialog = {

	load: function DTA_load() {
		strbundle = $("strings");
		$("dtaHelp").hidden = !("openHelp" in window);
	  
		versionControl();
		
		this.ddFilter = new DTA_DropDown(
			"filter",
			"filter",
			"filteritems",
			[strbundle.getString("ddfilter"), "/(\\.mp3)$/", "/(\\.(html|htm|rtf|doc|pdf))$/", "http://www.website.com/subdir/*.*", "http://www.website.com/subdir/pre*.???", "*.z??, *.css, *.html"]
		);
		this.ddDirectory = new DTA_DropDown("directory", "directory", "directoryitems", "", "");
		this.ddRenaming = new DTA_DropDown(
			"renaming",
			"renaming",
			"renamingitems",
			["*name*.*ext*", "*num*_*name*.*ext*", "*url*-*name*.*ext*", "*name* (*text*).*ext*", "*name* (*hh*-*mm*).*ext*"]
		);
		
		try {
			// searches links in the arguments passed by menu.xul
			var links = window.arguments[0];
			var images = window.arguments[1];
			
			$("viewlinks").label = $("viewlinks").label + " ("+ links.length + ")";
			this.links = new Tree(links, 1);

			$("viewpics").label = $("viewpics").label + " ("+ images.length + ")";
			this.images = new Tree(images, 2);

			this.showFilter(this.ddFilter.current.length);
			
			this.changeTab(Preferences.getDTA("seltab", 0) ? 'images': 'links');
		} catch(ex) {
			DTA_debug.dump("load():", ex);
		}
	},
	unload: function DTA_unload() {
		DTA_FilterManager.save();
		self.close();
	},
	
	check: function DTA_check() {
		var f = new filePicker();
		var dir = this.ddDirectory.current.trim();
		if (!dir.length || !this.ddRenaming.current.trim().length) {
			return false;
		}
		if (!f.createValidDestination(dir))
		{
			alert(strbundle.getString("alertfolder"));
			var newDir = f.getFolder(null, strbundle.getString("validdestination"));
			this.ddDirectory.current = newDir ? newDir : '';
			return false;
		}
		return true;
	},
	download: function(notQueue) {
		try {
			Preferences.setDTA("lastWasQueued", !notQueue);
		
			if (!this.check()) {
				return false;
			}
	
			var dir = this.ddDirectory.current;
			var mask = this.ddRenaming.current;
			var num = Preferences.getDTA("counter", 1);
			if (++num > 999) {
				num = 1;
			}
			Preferences.setDTA("counter", num);	
	
			var links = this.current._links;
			var out = [];
			for (var i = 0; i < links.length; ++i) {
				var link = links[i];
				if (!link.checked.length) {
					continue;
				}
				out.push(
					new downloadElement(
						link.url,
						dir,
						num,
						"description" in link ? link.description : "",
						"ultDescription" in link ? link.ultDescription : "",
						link.mask ? link.mask : mask,
						link.refPage
					)
				);
			}
			if (!out.length) {
				return false;
			}

			DTA_AddingFunctions.sendToDown(notQueue, out);
		
			// save history
			['ddDirectory', 'ddRenaming', 'ddFilter'].forEach(function (e) { Dialog[e].save(); });
				
			self.close();
			return true;
		
		} catch(ex) {
			Debug.dump("Downloadfile:", ex);
		}
		self.close();
		return false;
	},
	
	editMask: function() {
		
		if (!this.current.selection.count) {
			return;
		}

		var mask = {value: null};
		window.openDialog(
			"chrome://dta/content/dta/renamingmask.xul",
			"",
			"chrome, dialog, centerscreen, resizable=yes, dialog=no, modal, close=no",
			mask
		);
		if (!mask.value) {
			return;
		}
		var rangeCount = this.current.selection.getRangeCount();
		var start = {}, end = {};
		for (var r = 0; r < rangeCount; ++r) {
			this.current.selection.getRangeAt(r, start, end);
			for (var i = start.value; i <= end.value; ++i) {
				this.current._links[i].mask = mask.value;
			}
		}
		this.current.invalidate();
	},

	makeSelection: function() {
	
		var tree = this.current;
		var type = tree.type;
	
		var additional = this.ddFilter.current;
		if (!additional.length) {
			additional = null;
		}
		else if ($('regex').checked) {
			try {
				additional = DTA_regToRegExp(additional);
			} catch (ex) {
				additional = null;
			}
		}
		else {
			additional = DTA_strToRegExp(additional);
		}
	
		var used = {};
		var idx = 0;
		for (var x = 0; x < tree._links.length; ++x) {

			var link = tree._links[x];
			var checked = '';

			if (link.manuallyChecked) {
				checked = 'manuallySelected';
			}
			else if (link.url.usable.search(additional) != -1) {
				checked = 'f8';
			}
			
			var e = DTA_FilterManager.enumActive(type);
			while (e.hasMoreElements()) {
				var f = e.getNext().QueryInterface(Components.interfaces.dtaIFilter);
				if (f.match(link.url.usable)) {
					var i;
					if (f.id in used) {
						i = used[f.id];
					}
					else {
						i = idx = (idx + 1) % 8;
						used[f.id] = i;
					}
					checked = 'f' + i;
					break;
				}		
			}
			link.checked = checked;
		}
		tree.invalidate();
	},

	toggleBox: function(box) {

		if (!('filter') in box) {
			Debug.dump("toggleBox: invalid element");
			return;
		}
		var c = box.checked;
		var f = box.filter;
		f.active = c;
	
		this.makeSelection();
	},

	toggleSelection: function () {
	
		var mode = 0;
		if (arguments.length) {
			mode = arguments[0] ? 1 : 2;
		}
		var tree = this.current;
		
		var rangeCount = tree.selection.getRangeCount();
		var start = {}, end = {}, val;
		for (var r = 0; r < rangeCount; ++r) {
			tree.selection.getRangeAt(r, start, end);
			for (var i = start.value; i <= end.value; ++i) {
				switch (mode) {
					case 1:
						tree.setCellValue(i, null, 'true');
					break;
					case 2:
						tree.setCellValue(i, null, 'false');
					break;
					default:
						val = tree.getCellValue(i);
						val = val == 'true' ? 'false' : 'true';
						tree.setCellValue(i, null, val);
					break;
				}
			}
		}
		tree.invalidate();
	},

	changeTab: function (tab) {
		
		this.current = this[tab];
		$("urlList").view = this.current;

		var type = this.current.type;
		if (type == 1) {
			Preferences.setDTA('seltab', 0);
			$("viewlinks").setAttribute("selected", true); 
			$("viewpics").setAttribute("selected", false);
		}
		else {
			Preferences.setDTA('seltab', 1);
			$("viewlinks").setAttribute("selected", false);
			$("viewpics").setAttribute("selected", true);
		}

		var box = $("checkcontainer");
		while (box.hasChildNodes()) {
			box.removeChild(box.lastChild);
		}
		var e = DTA_FilterManager.enumAll();	
		while (e.hasMoreElements()) {
			var f = e.getNext().QueryInterface(Components.interfaces.dtaIFilter);
			if (!(f.type & type)) {
				continue;
			}
			var checkbox = document.createElement("checkbox");
			checkbox.setAttribute("checked", f.active);
			checkbox.setAttribute("id", f.id);
			checkbox.setAttribute("label", f.label);
			checkbox.setAttribute("class", "lista");
			checkbox.setAttribute("oncommand", "Dialog.toggleBox(this);");
			checkbox.filter = f;
			box.appendChild(checkbox);
		}

		this.makeSelection();
	},
	showFilter: function() {

		var reg = $("regexbox");
		var add = $("additional");
	
		if (arguments.length == 0) {
			reg.hidden = !(reg.hidden); 
		}
		else {
			reg.hidden = !(arguments[0]);
		}

		if (reg.hidden) {
			add.setAttribute("value", strbundle.getString("additional") + "...");
			add.setAttribute("class", "titolo expand");
		} else {
			add.setAttribute("class", "titolo collapse");
			add.setAttribute("value", strbundle.getString("additional") + ":");
		}
	},
	browseDir: function() {
		// let's check and create the directory
		var f = new filePicker();
		var newDir = f.getFolder(
			this.ddDirectory.current,
			strbundle.getString("validdestination")
		);
		if (newDir) {
			this.ddDirectory.current = newDir;
		}
	},
	showPopup: function() {
		var open = $('mopen');
		var tree = this.current;
		if (tree.selection.count) {
			var s = {}, e = {};
			tree.selection.getRangeAt(0, s, e);
			var l = tree._links[s.value];
			open.setAttribute("image", l.icon);
			open.setAttribute("label", l.url.url);
			open.hidden = false;
		} else {
			open.hidden = true;
		}
		return true;
	},
	openSelection: function() {
		var tree = this.current;
		var rangeCount = tree.selection.getRangeCount();
		var start = {}, end = {}, val;
		for (var r = 0; r < rangeCount; ++r) {
			tree.selection.getRangeAt(r, start, end);
			for (var i = start.value; i <= end.value; ++i) {
				DTA_Mediator.openTab(tree._links[i].url.url, tree._links[i].refPage);
			}
		}
	}
};

DTA_include("chrome://dta/content/dta/maskbutton.js");