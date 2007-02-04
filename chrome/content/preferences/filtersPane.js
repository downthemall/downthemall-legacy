/* ***** BEGIN LICENSE BLOCK *****
 * Version: GPL 2.0
 *
 * This code is part of DownThemAll! - dTa!
 * Copyright © 2004-2006 Federico Parodi and Stefano Verna.
 * 
 * See notice.txt and gpl.txt for details.
 *
 * Contributers:
 *	Nils Maier <MaierMan@web.de>
 *
 * ***** END LICENSE BLOCK ***** */
 
var strbundle;

var filterTree = {
	reloadFilters: function() {
		try {
			DTA_FilterManager.reload();
			var oldfilters = this._filterIDs;
			this._filterIDs = [];
			var e = DTA_FilterManager.enumAll();
			while (e.hasMoreElements()) {
				var filter = e.getNext().QueryInterface(Components.interfaces.dtaIFilter);
				this._filterIDs.push(filter.id);
			}
			var index = $("filterTable").view.selection.currentIndex;
			if (index != -1 && oldfilters[index] != this._filterIDs[index]) {
				$("filterTable").view.selection.select(this._filterIDs.indexOf(oldfilters[index]));
				Dialog.onTableSelectionChange();
			}
			this.invalidate();
		} catch(e) {
		}
	},
	get rowCount() {
		return DTA_FilterManager.count;
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
	getFilter: function(idx) {
		if (idx==-1) {
			throw new Components.Exception("invalid index specified: " + idx);
		}
		return DTA_FilterManager.getFilter(this._filterIDs[idx]);
	},
	getCellText: function(idx, col) {
		switch (col.index) {
			case 0:
				return this.getFilter(idx).label;
			case 1:
				return this.getFilter(idx).test;
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
		return false;
	},	
	getImageSrc: function(idx, col) {
		return null;
	},
	getProgressMode : function(idx,column) {
		
	},
	getCellValue: function(idx, column) {
		return false;
	},
	cycleHeader: function(col, elem) {},
	selectionChanged: function() {},
	cycleCell: function(idx, column) {},
	performAction: function(action) {},
	performActionOnRow: function(action, index, column) {},
	performActionOnCell: function(action, index, column) {},
	getRowProperties: function(idx, prop) {
		return;
	},
	getCellProperties: function(idx, column, prop) {
		return;
	},
	getColumnProperties: function(column, element, prop) {},
	setCellValue: function(idx, col, value) {
		return;
	},
	invalidate: function() {
		$("filterTable").view = this;
		$("filterTable").treeBoxObject.invalidate();
	}
};

var Dialog = {
	load: function DTA_load() {
		strbundle = $("strings");

		// load the filters for the first time
		$("filterTable").view = filterTree;
		filterTree.reloadFilters();
		
		$("filterText", "filterImage").forEach(function(a){a.addEventListener("CheckboxStateChange", Dialog.onFilterEdit, false);});
	},
	onTableSelectionChange: function() {
		var idx = $("filterTable").view.selection.currentIndex;
		
		
		if (idx==-1) {
			$("filterLabel", "filterTest", "filterText", "filterImage", "filterIsRegex", "removebutton").forEach(function(a){a.disabled=true});
			$("filterLabel", "filterTest").forEach(function(a){a.value=""});
			$("filterText", "filterImage", "filterIsRegex").forEach(function(a){a.checked=false});
			return;
		}
		
		var currentFilter = filterTree.getFilter(idx);

		$("filterLabel").value = currentFilter.label;
		$("filterTest").value = currentFilter.test;
		$("filterIsRegex").checked = currentFilter.isRegex;
		$("filterText").checked = currentFilter.type & 1;
		$("filterImage").checked = currentFilter.type & 2;
		
		$("filterLabel", "filterTest", "filterText", "filterImage", "filterIsRegex", "removebutton").forEach(function(a){a.disabled=currentFilter.defFilter});
	},
	onIsRegexClick: function() {
		var test = $("filterTest").value;
		if ($("filterIsRegex").checked) {
			if (test[0]!='/') test='/'+test;
			if (test[test.length-1]!='/') test=test+'/';
		} else {
			test = test.trim().replace(/^\/|\/$/gi, "");
		}
		$("filterTest").value = test;
		this.onFilterEdit();
	},
	onFilterEdit: function(evt) {
		var idx = $("filterTable").view.selection.currentIndex;
		var currentFilter = filterTree.getFilter(idx);
		
		if (idx==-1 || currentFilter.defFilter) {
			return;
		}

		$("filterIsRegex").checked = $("filterTest").value.match(/^\/.+\/$/);

		if (
			$("filterLabel").value!=currentFilter.label 
			||
			$("filterTest").value!=currentFilter.test
			||
			currentFilter.type!= ($("filterText").checked?1:0) + ($("filterImage").checked?2:0)
			)
		{
			currentFilter.label = $("filterLabel").value;
			currentFilter.test = $("filterTest").value;
			currentFilter.isRegex = $("filterTest").value.match(/^\/.+\/$/);
			currentFilter.type = ($("filterText").checked?1:0) + ($("filterImage").checked?2:0);
			currentFilter.save();
			filterTree.reloadFilters();
		}
	},
	createFilter: function() {
		DTA_FilterManager.create(
			strbundle.getString("newfilt"), 
			strbundle.getString("inserthere"),
			false,
			1,
			false
		);
		filterTree.reloadFilters();
	},
	removeFilter: function() {
		var idx = $("filterTable").view.selection.currentIndex;
		
		if (idx==-1) return;
		if (filterTree.getFilter(idx).defFilter) return;
		
		$("filterTable").view.selection.clearSelection();
		
		var currentFilter = filterTree.getFilter(idx).remove();
		filterTree.reloadFilters();
	},
	restoreDefaultFilters: function() {
		$("filterTable").view.selection.clearSelection();
		
		var e = DTA_FilterManager.enumAll();
		while (e.hasMoreElements()) {
			var filter = e.getNext().QueryInterface(Components.interfaces.dtaIFilter);
			if (!filter.defFilter)
				filter.remove();
		}
		filterTree.reloadFilters();
	}
};
