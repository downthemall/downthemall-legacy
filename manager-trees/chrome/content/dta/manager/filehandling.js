var FileHandling = {
	openFolder: function() {
		var select = tree.view.selection;
		var count = select.getRangeCount();
		
		// loop through the selection as usual
		for (var i = 0; i < count; ++i) {
			var start = {}; var end = {};
			select.getRangeAt(i,start,end);
			for (var c = start.value, e = end.value; c <= e; ++c) {
				try {
					if (downloadList[c].is(COMPLETE)) {
						OpenExternal.reveal(downloadList[c].dirSave + downloadList[c].destinationName);
					} else {
						OpenExternal.reveal(downloadList[c].dirSave);
					}
				} catch (ex) {
					Debug.dump('reveal', ex);
				}
			}
		}
	},
	openFile: function() {
		var cur = downloadList[tree.currentIndex];
		if (cur.is(COMPLETE)) {
			try {
				OpenExternal.launch(cur.dirSave + cur.destinationName);
			}
			catch (ex) {
				Debug.dump('launch', ex);
			}
		}
	},
	deleteFile: function() {
		var list = [];
		var select = tree.view.selection;
		var count = select.getRangeCount();
		
		// loop through the selection as usual
		for (var i = 0; i < count; ++i) {
			var start = {}, end = {};
			select.getRangeAt(i, start, end);
			for (var c = start.value, e = end.value; c <= e; ++c) {
				// just populate the list
				if (downloadList[c].is(COMPLETE)) {
					list.push(c);
				}
			}
		}
		// filter will return an array containing just the downloads we deleted
		list = list.filter(
			function(i) {
				var d = downloadList[i];
				try {
					var file = new FileFactory(d.dirSave + d.destinationName);
					if (file.exists()) {
						if (confirm("Sure to delete '" + file.path + "'?")) {
							file.remove(false);
							return true;
						}
						return false;
					}
					// file does not exists: no confirmation, just delete
					return true;
				}
				catch (ex) {
					Debug.dump('deleteFile: ', ex);
					return false;
				}
			}
		);
		if (list.length) {
			// remove filtered items
			removeFromList(list);
		}
	}
};