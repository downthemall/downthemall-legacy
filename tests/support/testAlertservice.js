module("support/alertservice.js");

test("exports", function() {
	checkExports("support/alertservice", ["available", "show"]);
});

test("availablity", function() {
	equal(require("support/alertservice").available, "@mozilla.org/alerts-service;1" in Cc);
});
if (require("support/alertservice").available) {
	test("show", function() {
		require("support/alertservice").show("test", "test");
	});
}
else {
	test("show", function() {
		raises(function() require("support/alertservice").show("test", "test"));
	});
}
