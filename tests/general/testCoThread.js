module("cothreads.js");

/* XXX require
test("exports", function() {
	checkExports("resource://dta/cothread.jsm", ['CoThread', 'CoThreadInterleaved', 'CoThreadListWalker']);
});
*/

asyncTest("CoThread1", function() {
	expect(2);
	var {CoThread} = glue2.require("cothreads");
	var hit = 0, hit2;
	new CoThread(
		function(count) {
			++hit;
			hit2 = count;
			return count < 1;
		}
	).start(function() {
		QUnit.start();
		equal(hit, 2);
		equal(hit2, 1);
	});
});
asyncTest("CoThread10", function() {
	expect(2);
	var {CoThread} = glue2.require("cothreads");
	var hit = 0, hit2;
	new CoThread(
			function(count) {
				++hit;
				hit2 = count;
				return count < 100;
			},
			10
	).start(function() {
		QUnit.start();
		equal(hit, 101);
		equal(hit2, 100);
	});
});

asyncTest("CoThreadInterleaved", function() {
	expect(1);
	var {CoThreadInterleaved} = glue2.require("cothreads");
	var hit = 0;
	new CoThreadInterleaved(
			function() {
				++hit;
				yield true;
				++hit;
			}
	).start(function() {
		QUnit.start();
		equal(hit, 2);
	});
});
asyncTest("CoThreadInterleaved already_generator", function() {
	expect(1);
	var {CoThreadInterleaved} = glue2.require("cothreads");
	var hit = 0;
	new CoThreadInterleaved(
			(function() {
				++hit;
				yield true;
				++hit;
			})()
	).start(function() {
		QUnit.start();
		equal(hit, 2);
	});
});

asyncTest("CoThreadListWalker array", function() {
	expect(1);
	var {CoThreadListWalker} = glue2.require("cothreads");
	var hit = 0;
	new CoThreadListWalker(
			function() {
				++hit;
				return true
			},
			[1,2]
	).start(function() {
		QUnit.start();
		equal(hit, 2);
	});
});

asyncTest("CoThreadListWalker generator", function() {
	expect(1);
	var {CoThreadListWalker} = glue2.require("cothreads");
	var hit = 0;
	new CoThreadListWalker(
			function() {
				++hit;
				return true
			},
			(function() { yield 1; yield 2; })()
	).start(function() {
		QUnit.start();
		equal(hit, 2);
	});
});
