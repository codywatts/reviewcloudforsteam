// ==UserScript==
// @name		ReviewCloud for Steam
// @author		Cody Watts
// @namespace	http://www.codywatts.com/reviewcloudforsteam
// @homepage	http://www.codywatts.com/reviewcloudforsteam
// @updateURL	https://www.codywatts.com/reviewcloudforsteam/reviewcloudforsteam.meta.js
// @downloadURL	https://www.codywatts.com/reviewcloudforsteam/reviewcloudforsteam.user.js
// @version		1.0.3
// @description	This user script generates word clouds from the user reviews on Steam.
// @match		http://store.steampowered.com/app/*
// @match		https://store.steampowered.com/app/*
// @require		http://code.jquery.com/jquery-2.1.1.js
// @grant		GM_addStyle
// @grant		GM_xmlhttpRequest
// @copyright	2014+, Cody Watts
// ==/UserScript==

////////////////////////////////////////////////////////////////////////////////
// FUNCTIONAL PROPERTIES
////////////////////////////////////////////////////////////////////////////////
var SHOW_INFO_IN_CONSOLE = false; // Should information about this script's execution be logged to the JavaScript console?
var NUMBER_OF_REQUESTS_FOR_ADDITIONAL_REVIEWS = 10; // How many times should we ask the Steam servers to give us more reviews?
var EXPECTED_NUMBER_OF_REVIEWS_RECEIVED_PER_REQUEST = 20; // This is the number of reviews we expect to receive per request to the Steam servers.
var DAY_RANGE = 720; // Exclude any reviews older than this many days.
var MULTI_TERM_WEIGHTING = 2.0; // The value assigned per word in a given term. Higher values will produce ReviewClouds with more multi-word terms.
var MAXIMUM_TERM_LENGTH = 10; // The maximum number of words which can appear in a term.
var TERM_SIGNIFICANCE_THRESHOLD = 0.4; // The percentage of time for which a term must occur as a subset of another (longer) term in order for that term to be ignored.

////////////////////////////////////////////////////////////////////////////////
// AESTHETIC PROPERTIES
////////////////////////////////////////////////////////////////////////////////
var REVIEW_CLOUD_HEIGHT = 350; // The height of the ReviewCloud in pixels.
var DEFAULT_FONT_SIZE = 8; // The font size of the smallest text in the ReviewCloud in pixels.
var FONT_SIZE_PERCENT_INCREASE_PER_LEVEL = 20; // The percentage increase in font size between "levels" in the ReviewCloud.
var MAXIMUM_NUMBER_OF_TERMS_IN_CLOUD = 100; // The maximum number of terms which will appear in the cloud.
var PER_TERM_DELAY_TIME = 4; // The delay between the appearance of each term in the ReviewCloud (in milliseconds.)
var TERM_PADDING = 3; // The padding between a tern and its border, in pixels.
var TERM_SPACING = 3; // The spacing between a term and another term in the ReviewCloud, in pixels.
var SPINNER_SIZE = (REVIEW_CLOUD_HEIGHT * 0.75); // The size of the loading spinner, in pixels.
var FADE_OUT_TIME = 500; // How quickly the "loading" overlay fades out (in milliseconds.)
var FADE_IN_TIME = 300; // How quickly the ReviewCloud fades in (in milliseconds.)
var POSITIVE_TERM_HUE = 205; // The hue used to render terms which have a 100% positive association.
var NEGATIVE_TERM_HUE = 5; // The hue used to render terms which have a 100% negative association.
var MAXIMUM_TERM_SATURATION = 0.5; // The maximum saturation value used to render terms.
var MINIMUM_TERM_VALUE = 0.55; // The minimum intensity value used to render terms. Terms with greater weight are rendered with higher intensity values.
var LOG_BASE = 3.0; // Controls the size of the terms relative to each other. Lower values lead to greater scale variations. Should be between 1.0 and infinity.
var TERM_BACKGROUND_ALPHA = 0.1; // The alpha value for the term background. Should be between 0.0 and 1.0.
var ROUNDED_CORNER_RADIUS = 6; // The radius of the term-container's rounded corners, in pixels.

////////////////////////////////////////////////////////////////////////////////
// "GLOBAL VARIABLES"
////////////////////////////////////////////////////////////////////////////////
var g_reviews = new Array();
var g_numberOfOutstandingRequestsMadeToSteamServers = NUMBER_OF_REQUESTS_FOR_ADDITIONAL_REVIEWS;
var g_processedReviews = {};

////////////////////////////////////////////////////////////////////////////////
// SCRIPT ENTRY POINT
////////////////////////////////////////////////////////////////////////////////
main();

////////////////////////////////////////////////////////////////////////////////
//
// main: The main entry point of the script. It creates a container to hold
// the ReviewCloud, it shows up the "loading" overlay, and it kicks off the
// requests for additional review data.
//
////////////////////////////////////////////////////////////////////////////////
function main()
{
	if (appHasReviews() == false)
	{
		logInfo("A ReviewCloud cannot be generated because there are no reviews for this product.");
		return;
	}
	
	var reviewCloudContainerElement = createReviewCloudContainer();
	if (reviewCloudContainerElement == null)
	{
		logError("Could not create a page element to hold the ReviewCloud. The ReviewCloud will not be displayed.");
		return;
	}
	
	showLoadingOverlay();
	
	var percentageOfPositiveReviews = getPercentageOfPositiveReviews();
	if (percentageOfPositiveReviews != null)
	{
		var numberOfRequestsForPositiveReviews = Math.round(NUMBER_OF_REQUESTS_FOR_ADDITIONAL_REVIEWS * percentageOfPositiveReviews);
	
		for (var i = 0; i < numberOfRequestsForPositiveReviews; ++i)
		{
			requestReviewsFromServer(i * EXPECTED_NUMBER_OF_REVIEWS_RECEIVED_PER_REQUEST, "positive");
		}
		
		var numberOfRequestsForNegativeReviews = NUMBER_OF_REQUESTS_FOR_ADDITIONAL_REVIEWS - numberOfRequestsForPositiveReviews;
		for (var i = 0; i < numberOfRequestsForNegativeReviews; ++i)
		{
			requestReviewsFromServer(i * EXPECTED_NUMBER_OF_REVIEWS_RECEIVED_PER_REQUEST, "negative");
		}
	}
	// If we could not determine what percentage of reviews were positive...
	else
	{
		for (var i = 0; i < NUMBER_OF_REQUESTS_FOR_ADDITIONAL_REVIEWS; ++i)
		{
			requestReviewsFromServer(i * EXPECTED_NUMBER_OF_REVIEWS_RECEIVED_PER_REQUEST, "all");
		}
	}
}

////////////////////////////////////////////////////////////////////////////////
//
// appHasReviews: Returns true or false, indicating whether or not this app
// has any reviews or not.
//
////////////////////////////////////////////////////////////////////////////////
function appHasReviews()
{
	return document.getElementById("Reviews_all") != null;
}

////////////////////////////////////////////////////////////////////////////////
//
// createReviewCloudContainer: Creates a page element to hold the review cloud.
//
////////////////////////////////////////////////////////////////////////////////
function createReviewCloudContainer()
{
	var mainContentElement = getMainContentElement();
	if (mainContentElement == null)
	{
		logError("Could not locate the main content element. The ReviewCloud will not be displayed.");
		return null;
	}
	
	var gameDescriptionColumnElement = mainContentElement.getElementsByClassName("game_description_column");
	if (gameDescriptionColumnElement == null)
	{
		logError("Could not find a page element with class \"game_description_column\". The ReviewCloud will not be displayed.");
		return null;
	}
	gameDescriptionColumnElement = gameDescriptionColumnElement[0];
	
	var userReviewsHeaderElement = gameDescriptionColumnElement.getElementsByClassName("user_reviews_header");
	if (userReviewsHeaderElement == null)
	{
		logError("Could not find a page element with class \"user_reviews_header\". The ReviewCloud will not be displayed.");
		return null;
	}
	userReviewsHeaderElement = userReviewsHeaderElement[0];

	var reviewCloudHeaderElement = document.createElement('div');
	reviewCloudHeaderElement.innerHTML = '<h2>ReviewCloud</h2>';
	reviewCloudHeaderElement.setAttribute("class", "game_area_description");
	reviewCloudHeaderElement.style.minWidth = $('#game_area_description').width() + 'px';
	gameDescriptionColumnElement.insertBefore(reviewCloudHeaderElement, userReviewsHeaderElement);

	var reviewCloudContainerElement = document.createElement('div');
	reviewCloudContainerElement.setAttribute("id", "review_cloud");
	reviewCloudContainerElement.style.height = REVIEW_CLOUD_HEIGHT + 'px';
	reviewCloudContainerElement.style.position = 'relative';
	reviewCloudContainerElement.style.display = 'block';
	reviewCloudContainerElement.style.minWidth = $('#game_area_description').width() + 'px';
	reviewCloudHeaderElement.appendChild(reviewCloudContainerElement);
	
	return reviewCloudContainerElement;
}

////////////////////////////////////////////////////////////////////////////////
//
// getPercentageOfPositiveReviews: Returns the percentage of reviews for this
// game which are positive.
//
////////////////////////////////////////////////////////////////////////////////
function getPercentageOfPositiveReviews()
{
	var atAGlanceContainerElement = document.getElementsByClassName("glance_ctn");
	if (atAGlanceContainerElement == null)
	{
		logError("Could not find a page element with class \"glance_ctn\". It will not be possible to determine what percentage of reviews are positive.");
		return null;
	}
	atAGlanceContainerElement = atAGlanceContainerElement[0];
	
	var percentageOfPositiveReviewsRegexResults = atAGlanceContainerElement.innerHTML.match(/(\d+)% of the .* user review/);
	if (percentageOfPositiveReviewsRegexResults == null)
	{
		logError("Could not determine what percentage of reviews are positive.");
		return null;
	}
	else
	{
		return parseInt(percentageOfPositiveReviewsRegexResults[1]) / 100.0;
	}
}

////////////////////////////////////////////////////////////////////////////////
//
// getMainContentElement: Returns a reference to the page element which
// contains the main content.
//
////////////////////////////////////////////////////////////////////////////////
function getMainContentElement()
{
	var mainContentElement = document.getElementsByClassName("page_content_ctn");
	if (mainContentElement == null)
	{
		logError("Could not find a page element with class name \"page_content_ctn\".");
		return null;
	}
	
	return mainContentElement[0];
}

////////////////////////////////////////////////////////////////////////////////
//
// showLoadingOverlay: Displays an animated "loading" overlay while the
// ReviewCloud is being generated.
//
////////////////////////////////////////////////////////////////////////////////
function showLoadingOverlay()
{
	var reviewCloudContainerElement = document.getElementById("review_cloud");
	
	var spinnerContainer = document.createElement('div');
	spinnerContainer.setAttribute("name", "spinner_container"); 
	spinnerContainer.setAttribute("id", "spinner_container"); 
	spinnerContainer.style.color = "rgb(240, 240, 240)";
	spinnerContainer.style.position = "absolute";
	spinnerContainer.style.right = "0";
	spinnerContainer.style.left = "0";
	spinnerContainer.style.top = "0";
	spinnerContainer.style.bottom = "0";
	spinnerContainer.style.textAlign = "center";
	spinnerContainer.style.display = "table-cell";
	spinnerContainer.style.verticalAlign = "middle";
	reviewCloudContainerElement.appendChild(spinnerContainer);
	
	GM_addStyle
	(
		"#spinner {" +
		"width: " + SPINNER_SIZE + "px;" +
		"height: " + SPINNER_SIZE + "px;" +
		"-webkit-animation: sweep 1.75s infinite linear;" +
		"border-radius:" + SPINNER_SIZE/2.0 + "px;" +
		"border-bottom:" + SPINNER_SIZE/25.0 + "px solid rgb(240, 240, 240);" +
		"}" +
		"@-webkit-keyframes sweep { to { -webkit-transform: rotate(360deg); } }"
	);
	
	var spinner = document.createElement('div');
	spinner.setAttribute("name", "spinner");
	spinner.setAttribute("id", "spinner");  
	spinner.style.position = "absolute";
	spinner.style.margin = "auto auto";
	spinner.style.right = "0";
	spinner.style.left = "0";
	spinner.style.top = "0";
	spinner.style.bottom = "0";
	spinnerContainer.appendChild(spinner);
	
	var progressText = document.createElement('div');
	progressText.setAttribute("name", "progress_text"); 
	progressText.setAttribute("id", "progress_text"); 
	progressText.style.fontSize = "36px";
	progressText.style.color = "rgb(240, 240, 240)";
	progressText.style.position = "absolute";
	progressText.style.right = "0";
	progressText.style.left = "0";
	progressText.style.top = "0";
	progressText.style.bottom = "0";
	progressText.style.textAlign = "center";
	progressText.style.display = "table-cell";
	progressText.style.verticalAlign = "middle";
	progressText.style.lineHeight = REVIEW_CLOUD_HEIGHT + "px";
	progressText.innerHTML = "Loading...";
	reviewCloudContainerElement.appendChild(progressText);
}

////////////////////////////////////////////////////////////////////////////////
//
// hideLoadingOverlay: Fades out the "loading" overlay when the ReviewCloud is
// ready to be displayed.
//
////////////////////////////////////////////////////////////////////////////////
function hideLoadingOverlay()
{
	if (document.getElementById("spinner_container"))
	{
		$("#spinner_container").fadeOut(FADE_OUT_TIME);
	}
	if (document.getElementById("progress_text"))
	{
		$("#progress_text").fadeOut(FADE_OUT_TIME);
	}
}

////////////////////////////////////////////////////////////////////////////////
//
// logInfo: Outputs general logging information to the console.
//
////////////////////////////////////////////////////////////////////////////////
function logInfo(string)
{
	if (SHOW_INFO_IN_CONSOLE == true)
	{
		console.info("[ReviewCloud for Steam] " + string);
	}
}

////////////////////////////////////////////////////////////////////////////////
//
// logError: Outputs an error to the console. Errors indicate that the script
// has failed in some way and that it may not be possible to continue.
//
////////////////////////////////////////////////////////////////////////////////
function logError(string)
{
	console.error("[ReviewCloud for Steam] " + string);
}

////////////////////////////////////////////////////////////////////////////////
//
// getAppID: Returns the app ID for the current page.
//
////////////////////////////////////////////////////////////////////////////////
function getAppID()
{
	// If this function has not yet been run...
	if (typeof getAppID.appID == 'undefined')
	{
		var documentURL = document.location.href;
		
		var appIDRegexResults = documentURL.match(/\/app\/(\d+)/i);
		if (appIDRegexResults == null)
		{
			logError("Could not determine the app ID from URL \"" + documentURL + "\".");
			getAppID.appID = 0;
		}
		else
		{
			getAppID.appID = appIDRegexResults[1];
		}
	}

	return getAppID.appID;
}

////////////////////////////////////////////////////////////////////////////////
//
// getAppName: Returns the app name for the current page.
//
////////////////////////////////////////////////////////////////////////////////
function getAppName()
{
	// If this function has not yet been run...
	if (typeof getAppName.appName == 'undefined')
	{
		getAppName.appName = "";
		
		var mainContentElement = getMainContentElement();
		if (mainContentElement != null)
		{
			var appNameDiv = mainContentElement.getElementsByClassName("apphub_AppName");
			if (appNameDiv.length != 0)
			{
				getAppName.appName = sanitizeText(appNameDiv[0].innerHTML.trim());
			}
		}
		
		if (getAppName.appName === "")
		{
			logError("Could not determine the app name.");
		}
	}

	return getAppName.appName;
}

////////////////////////////////////////////////////////////////////////////////
//
// getAppNameAsRegExp: Returns the app name as a regular expression.
//
////////////////////////////////////////////////////////////////////////////////
function getAppNameAsRegExp()
{
	// If this function has not yet been run...
	if (typeof getAppNameAsRegExp.regularExpression == 'undefined')
	{
		var uniqueWordsInAppName = getUniqueTerms(getAppName(), 1, 1);
		var pipeDelimitedAppName = uniqueWordsInAppName.join('|');
		getAppNameAsRegExp.regularExpression = new RegExp('\\b(' + pipeDelimitedAppName + ')\\b', 'g');
	}

	return getAppNameAsRegExp.regularExpression;
}

////////////////////////////////////////////////////////////////////////////////
//
// requestReviewsFromServer: Requests reviews from the Steam servers starting
// at the specified offset.
//
////////////////////////////////////////////////////////////////////////////////
function requestReviewsFromServer(startOffset, filter)
{
	var requestURL = "http://store.steampowered.com/appreviews/" + getAppID() + "?start_offset=" + startOffset + "&day_range=" + DAY_RANGE + "&filter=" + filter;
	logInfo("Requesting \"" + filter + "\" reviews starting at offset " + startOffset + " via: " + requestURL);

	GM_xmlhttpRequest({
		method: "GET",
		url: requestURL,
		onload: function(response)
		{
			onReceivedReviewsFromServer(response);
		},
		onabort: function(response)
		{
			onRequestFailed(response);
		},
		onerror: function(response)
		{
			onRequestFailed(response);
		},
		ontimeout: function(response)
		{
			onRequestFailed(response);
		}
	});
}

////////////////////////////////////////////////////////////////////////////////
//
// onReceivedReviewsFromServer: This function is called when more reviews are
// ready for processing.
//
////////////////////////////////////////////////////////////////////////////////
function onReceivedReviewsFromServer(response)
{
	var parsedResponse = JSON.parse(response.responseText);
	if (parsedResponse.success == 1)
	{
		var reviewsReceivedCount = parsedResponse.recommendationids.length;
		
		logInfo("Received " + reviewsReceivedCount + " reviews (" + parsedResponse.recommendationids.join(", ") + ") from the Steam servers.");
		
		if (reviewsReceivedCount > 0)
		{
			var listingsReceived = parsedResponse.html;

			var div = document.createElement('div');
			div.innerHTML = parsedResponse.html;

			extractReviewData(div);
		}
	}
	else
	{
		logError("A request to the Steam servers failed for some reason. The parsed response follows: " + parsedResponse);
	}
	
	onRequestFinished();
}

////////////////////////////////////////////////////////////////////////////////
//
// onRequestFailed: This function is called when a request to the server failed
// for some reason (e.g. it encountered an error, or it timed out.)
//
////////////////////////////////////////////////////////////////////////////////
function onRequestFailed(response)
{
	logError("A request failed for the following reason: " + response.responseText);

	onRequestFinished();
}

////////////////////////////////////////////////////////////////////////////////
//
// onRequestFinished: This function is called when a request to the Steam
// servers finishes for any reason. It counts down until there are no
// outstanding requests remaining, and then it makes a call to begin generating
// the ReviewCloud.
//
////////////////////////////////////////////////////////////////////////////////
function onRequestFinished()
{
	g_numberOfOutstandingRequestsMadeToSteamServers--;
	
	if (g_numberOfOutstandingRequestsMadeToSteamServers == 0)
	{
		onAllReviewsReadyForProcessing();
	}
}

////////////////////////////////////////////////////////////////////////////////
//
// onAllReviewsReadyForProcessing: This function is called when we have
// received all the reviews we are expecting to receive from the Steam servers.
// The review data is stored in the global variable, "g_reviews".
//
////////////////////////////////////////////////////////////////////////////////
function onAllReviewsReadyForProcessing(response)
{
	// Sanitize the text for all reviews so that it is ready for processing.
	for (var i = 0; i < g_reviews.length; ++i)
	{
		g_reviews[i].text = sanitizeText(g_reviews[i].text);
	}

	// Extract all multi-word terms from the review text
	logInfo("Looking for meaningful multi-word terms...");
	var termCounts = {};

	for (var i = 0; i < g_reviews.length; ++i)
	{
		var review = g_reviews[i];
		var uniqueTermsInThisReview = getUniqueTerms(review.text, 2, MAXIMUM_TERM_LENGTH);
		
		// Go over the set of unique terms in this review and increment their counts in the "termCounts" array.
		for (var j = 0; j < uniqueTermsInThisReview.length; ++j)
		{
			var term = uniqueTermsInThisReview[j];
			if (term in termCounts == false)
			{
				termCounts[term] = { negativeCount: 0, positiveCount: 0 };
			}
			
			if (review.isPositive)
			{
				termCounts[term].positiveCount++;
			}
			else
			{
				termCounts[term].negativeCount++;
			}
		}
	}
	
	// Filter out multi-word terms which only occur once, or which we consider undesirable.
	for (var term in termCounts)
	{
		if ((termCounts[term].positiveCount + termCounts[term].negativeCount) <= 1)
		{
			delete termCounts[term];
		}
		else if (shouldBeFiltered(term))
		{
			delete termCounts[term];
		}
	}

	// Create an array to hold all of our multi-word terms.
	var multiWordTerms = [];
	
	for (var term in termCounts)
	{
		multiWordTerms.push(term);
	}

	// Sort the multi-word term array so that the terms with the most words in them are at the front.
	multiWordTerms.sort(function(a, b)
	{
		var numberOfWordsInA = a.split(" ").length;
		var numberOfWordsInB = b.split(" ").length;
		if (numberOfWordsInA != numberOfWordsInB)
		{
			return numberOfWordsInB - numberOfWordsInA;
		}
		else
		{
			aCounts = termCounts[a];
			bCounts = termCounts[b];
			return ((bCounts.positiveCount + bCounts.negativeCount) - (aCounts.positiveCount + aCounts.negativeCount));
		}
	});
	
	// Remove terms which we think are derivative of other, longer terms.
	for (var i = 0; i < multiWordTerms.length; ++i)
	{
		var parentTerm = multiWordTerms[i];
		var parentTermCount = termCounts[parentTerm].positiveCount + termCounts[parentTerm].negativeCount;
		if (parentTermCount > 0)
		{
			var numberOfWordsInParentTerm = parentTerm.split(" ").length;
			if (numberOfWordsInParentTerm > 2)
			{
				var subTerms = getUniqueTerms(parentTerm, 2, numberOfWordsInParentTerm - 1);
				for (var j = 0; j < subTerms.length; ++j)
				{
					var subTerm = subTerms[j];
					if (subTerm in termCounts)
					{
						var subTermCount = termCounts[subTerm].positiveCount + termCounts[subTerm].negativeCount;
						if (parentTermCount / subTermCount > TERM_SIGNIFICANCE_THRESHOLD)
						{
							termCounts[subTerm].positiveCount = 0
							termCounts[subTerm].negativeCount = 0
						}
					}
				}
			}
		}
	}
	
	// Sort the multi-word terms by their frequency
	multiWordTerms.sort(function(a, b)
	{
		aCounts = termCounts[a];
		bCounts = termCounts[b];
		return ((bCounts.positiveCount + bCounts.negativeCount) - (aCounts.positiveCount + aCounts.negativeCount));
	});
	
	multiWordTerms = multiWordTerms.slice(0, MAXIMUM_NUMBER_OF_TERMS_IN_CLOUD);
	var significantTermsRegularExpression = new RegExp('\\b\\s*(' + multiWordTerms.join('|') + ')\\s*\\b', 'g');
	
	for (var i = 0; i < g_reviews.length; ++i)
	{
		var review = g_reviews[i];
		review.text = review.text.replace(significantTermsRegularExpression, '');

		var uniqueTermsInThisReview = getUniqueTerms(review.text, 1, 1);
		
		// Go over the set of unique terms in this review and increment their counts in the "termCounts" array.
		for (var j = 0; j < uniqueTermsInThisReview.length; ++j)
		{
			var term = uniqueTermsInThisReview[j];
			if (term in termCounts == false)
			{
				termCounts[term] = { negativeCount: 0, positiveCount: 0 };
			}
			
			if (review.isPositive)
			{
				termCounts[term].positiveCount++;
			}
			else
			{
				termCounts[term].negativeCount++;
			}
		}
	}
	
	for (var term in termCounts)
	{
		// Push all terms which occur more than once into the sortedTerms array.
		if ((termCounts[term].positiveCount + termCounts[term].negativeCount) <= 1)
		{
			delete termCounts[term];
		}
		else if (shouldBeFiltered(term))
		{
			delete termCounts[term];
		}
	}
	
	consolidateHyphenatedTerms(termCounts);
	
	consolidateSingularAndPluralForms(termCounts);
	
	showReviewCloud(termCounts);
}

////////////////////////////////////////////////////////////////////////////////
//
// sanitizeText: This function transforms text received from Steam so that it
// is ready for processing.
//
////////////////////////////////////////////////////////////////////////////////
function sanitizeText(text)
{
	// Steam censors swears in reviews by replacing them with hearts, which can ♥♥♥♥ up the analysis. Get rid of them!
	text = text.replace(/(\u2665\w*)/g, '');

	// Change the text to lowercase.
	text = text.toLowerCase();
	
	// Replace apostrophe-like characters with apostrophes.
	text = text.replace(/[‘’´]/g, '\'');
	
	// Replace quotation mark-like characters with quotation marks.
	text = text.replace(/[“”]/g, '\"');
	
	// Replace hyphen-like characters with hyphens.
	text = text.replace(/[–—‒―]/g, '-');

	return text;
}

////////////////////////////////////////////////////////////////////////////////
//
// getUniqueTerms: This function takes a string and a minimum and maximum term
// length and extracts the unique set of terms from that text. A term is
// defined as one or more words, separated by spaces.
//
////////////////////////////////////////////////////////////////////////////////
function getUniqueTerms(text, minimumTermLength, maximumTermLength)
{
	var clauses = text.match(/([a-z0-9](?:[\\\/][0-9]|[\'\-][a-z0-9]|[a-z0-9\ ])*)/gi);

	// If there were no clauses in our review text...
	if (clauses === null)
	{
		return [];
	}
		
	var uniqueTermsSet = {};
	
	for (var i = 0; i < clauses.length; ++i)
	{
		var clause = clauses[i].trim();

		var wordsInClause = clause.split(' ');

		// For all the words in the clause, generate a set of terms.
		for (var j = 0; j < wordsInClause.length; ++j)
		{
			var term = "";
			
			for (var k = 0; k < maximumTermLength && j + k < wordsInClause.length; ++k)
			{
				term += (k == 0 ? "" : " ") + wordsInClause[j + k];
				if (k + 1 >= minimumTermLength)
				{
					if (!(term in uniqueTermsSet))
					{
						uniqueTermsSet[term] = true;
					}
				}
			}
		}
	}
	
	var uniqueTerms = [];
	for (var term in uniqueTermsSet)
	{
		uniqueTerms.push(term);
	}
	
	return uniqueTerms;
}

////////////////////////////////////////////////////////////////////////////////
//
// consolidateSingularAndPluralForms: This function combines the singular and 
// plural forms of terms in order to give these terms a more accurate
// representation within the ReviewCloud.
//
////////////////////////////////////////////////////////////////////////////////
function consolidateSingularAndPluralForms(termCounts)
{
	logInfo("Consolidating singular terms with their plural forms...");
	
	// This is a very rudimentary, naive approach to detecting pluralization.
	// A more robust approach can be found at http://www.csse.monash.edu.au/~damian/papers/HTML/Plurals.html	
	var pluralizationSchemeSchemes =
	[
		{ regex: /^(.*?)s$/, singularEndings: [''] }, // Dogs, etc.
		{ regex: /^(.*?)sses$/, singularEndings: ['ss', 's'] }, // Messes, gasses, etc.
		{ regex: /^(.*?)ies$/, singularEndings: ['y', 'ie'] }, // Puppies, zombies, etc.
		{ regex: /^(.*?)shes$/, singularEndings: ['sh'] }, // Bushes, etc.
		{ regex: /^(.*?)ches$/, singularEndings: ['ch'] }, // Churches, etc.
		{ regex: /^(.*?)oes$/, singularEndings: ['o'] }, // Tomatoes, etc.
		{ regex: /^(.*?)ves$/, singularEndings: ['ve', 'f'] } // Objectives, wolves, etc.
	]
			
	for (var word in termCounts)
	{
		// If the term ends with 's', and the final word in the term is at least four letters long...
		if (/\w{3,}s$/.test(word))
		{
			var pluralForm = word;
			
			var foundSingularForm = false;
			for (var i = 0; i < pluralizationSchemeSchemes.length && !foundSingularForm; ++i)
			{
				var pluralizationScheme = pluralizationSchemeSchemes[i];
				var prefix = pluralizationScheme.regex.exec(pluralForm);
				if (prefix != null)
				{
					for (var j = 0; j < pluralizationScheme.singularEndings.length && !foundSingularForm; ++j)
					{
						var singularEnding = pluralizationScheme.singularEndings[j];
						var singularForm = prefix[1] + singularEnding;

						if (singularForm in termCounts)
						{
							foundSingularForm = true;
							
							var singularTotalCount = termCounts[singularForm].positiveCount + termCounts[singularForm].negativeCount;
							var pluralTotalCount = termCounts[pluralForm].positiveCount + termCounts[pluralForm].negativeCount;
							
							if (pluralTotalCount >= singularTotalCount)
							{
								logInfo("Merging \"" + singularForm + "\" (" + singularTotalCount + ") into \"" + pluralForm + "\" (" + pluralTotalCount + ").");
								
								termCounts[pluralForm].positiveCount += termCounts[singularForm].positiveCount;
								termCounts[pluralForm].negativeCount += termCounts[singularForm].negativeCount;
								
								delete termCounts[singularForm];
							}
							else
							{
								logInfo("Merging \"" + pluralForm + "\" (" + pluralTotalCount + ") into \"" + singularForm + "\" (" + singularTotalCount + ").");
								
								termCounts[singularForm].positiveCount += termCounts[pluralForm].positiveCount;
								termCounts[singularForm].negativeCount += termCounts[pluralForm].negativeCount;
								
								delete termCounts[pluralForm];
							}
						}
					}
				}
			}
		}
	}
}

////////////////////////////////////////////////////////////////////////////////
//
// consolidateHyphenatedTerms: This function combines hyphenated terms with
// their non-hyphenated equivalents (e.g. "first-person" with "first person")
// in order to give these terms more accurate representation within the
// ReviewCloud.
//
////////////////////////////////////////////////////////////////////////////////
function consolidateHyphenatedTerms(termCounts)
{
	logInfo("Consolidating hyphenated terms...");
	
	for (var term in termCounts)
	{
		// If this term contains a hyphen...
		if (/\w-\w/g.test(term))
		{
			var hyphenatedTerm = term;
			var nonHyphenatedTerm = hyphenatedTerm.replace(/-/, '');
			var nonHyphenatedTermWithSpace = hyphenatedTerm.replace(/-/, ' ');
			
			var alternateForms = [hyphenatedTerm, nonHyphenatedTerm, nonHyphenatedTermWithSpace];
			
			// Sort by ascending frequency
			alternateForms.sort(function(a,b)
			{
				if (a in termCounts && b in termCounts)
				{
					var aCount = termCounts[a].positiveCount + termCounts[a].negativeCount;
					var bCount = termCounts[b].positiveCount + termCounts[b].negativeCount;
					return (aCount - bCount);
				}
				
				return (a in termCounts ? 1 : -1);
			});
			
			var mostCommonForm = alternateForms.pop();
			
			logInfo("Combining \"" + alternateForms.join("\", \"") + "\" with \"" + mostCommonForm + "\".");

			for (var i = 0; i < alternateForms.length; ++i)
			{
				var lessCommonForm = alternateForms[i];
				
				if (lessCommonForm in termCounts)
				{
					termCounts[mostCommonForm].positiveCount += termCounts[lessCommonForm].positiveCount;
					termCounts[mostCommonForm].negativeCount += termCounts[lessCommonForm].negativeCount;
					delete termCounts[lessCommonForm];
				}
			}
		}
	}
}

////////////////////////////////////////////////////////////////////////////////
//
// stripURLs: Removes URLs from a given string.
//
// This regular expression was created by John Gruber.
// See: https://gist.github.com/gruber/249502
//
////////////////////////////////////////////////////////////////////////////////
function stripURLs(string)
{
	string = string.replace(/\b((?:[a-z][\w-]+:(?:\/{1,3}|[a-z0-9%])|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))/ig, '');
	
	return string;
}

////////////////////////////////////////////////////////////////////////////////
//
// extractReviewData: This function takes as input, a page element containing
// one or more reviews. It extracts the review data from that element and
// pushes each review into the global "g_reviews" array.
//
////////////////////////////////////////////////////////////////////////////////
function extractReviewData(reviewsContainer)
{
	var reviewBoxElements = reviewsContainer.getElementsByClassName("review_box");

	for (var i = 0; i < reviewBoxElements.length; ++i)
	{
		var reviewBoxElement = reviewBoxElements[i];
		
		var reviewId = reviewBoxElement.innerHTML.match(/"ReviewContent(.+\d+)"/i);
		if (reviewId == null)
		{
			logError("Could not determine a review ID.");
		}
		else
		{
			reviewId = reviewId[1];
			
			// If we have already parsed this review, skip it.
			if (reviewId in g_processedReviews)
			{
				continue;
			}
			else
			{
				g_processedReviews[reviewId] = true;
			}
		}
		
		var reviewIsPositive = null;
		var reviewThumbElement = reviewBoxElement.getElementsByClassName("thumb");
		if (reviewThumbElement.length != 0)
		{
			var reviewThumbHTML = reviewThumbElement[0].innerHTML;
			if (/thumbsUp/i.test(reviewThumbHTML))
			{
				reviewIsPositive = true;
			}
			else if (/thumbsDown/i.test(reviewThumbHTML))
			{
				reviewIsPositive = false;
			}
		}
		
		if (reviewIsPositive == null)
		{
			logError("Could not determine whether this review was positive or negative!");
			continue;
		}
		
		var reviewText = "";
		var reviewContentElement = reviewBoxElement.getElementsByClassName("content");
		if (reviewContentElement.length == 0)
		{
			logError("Could not determine the content of this review!");
			continue;
		}
		else
		{
			reviewContentElement = reviewContentElement[0];
			// Strip all HTML tags (and convert them to line-breaks.)
			reviewContentElement.innerHTML = reviewContentElement.innerHTML.replace(/<[^>]*>/ig, "\n");
			reviewText = reviewContentElement.textContent;
			reviewText = stripURLs(reviewText);
			reviewText = reviewText.trim();
		}

		g_reviews.push({text: reviewText, isPositive: reviewIsPositive});
	}
}

////////////////////////////////////////////////////////////////////////////////
//
// shouldBeFiltered: This function takes a term as input and returns true or
// false, indicating whether that term should be excluded from the ReviewCloud.
// Certain terms are filtered in order to make the ReviewCloud more meaningful.
//
////////////////////////////////////////////////////////////////////////////////
function shouldBeFiltered(term)
{
	// Remove any terms which are less than four letters long.
	if (term.length <= 3)
	{
		return true;
	}
	
	// Remove any terms which contain only numbers.
	if (/^\d+$/.test(term))
	{
		return true;
	}
	// Don't use the word "game" or "steam" or "based".
	if (/^(game|steam|based)$/.test(term))
	{
		return true;
	}
	
	if (/^(a|about|although|an|and|as|at|because|but|by|each|for|from|her|his|however|if|in|is(n(')?t)?|are(n(')?t)?|am|was(n(')?t)?|were(n(')?t)?|it's|my|of|of course|on|play(s|ed|ing)?|some|than|that|the|their|this|through(( )?out)?|to|with(( )?out)?|your)\b/.test(term))
	{
		return true;
	}
	
	if (/\b((be)?c(ome|omes|ame|oming)|(dis)?lik(e|es|ed|ing)|'(s|ll|t|ve|m|re)|(un)?lock(s|ed|ing)|(un)?lock(s|ed|ing)?|a|a( )?lot|able|about|above|absolutely|across|act(s|ed)?|actual|actually|add(s|ed|ing)?|addition|after|again|against|ago|all|allow(s|ed|ing)?|almost|along|already|also|although|always|am|amount|an|and|another|any|anyone|anything|anyway|around|as|aside|at|attack(ed|ing)|avoid(s|ed|ing)?|away|b(uy|uys|ought|uying)|b(uys|ought|uying)|back|basically|battl(ed|ing)|be(en|ing)?|beat(s|ing)?|because|before|behind|believ(e|es|ed|ing)|better|between|beyond|biggest|bit|both|bought|br(ing|ings|ought)|break|buil(d|ds|t|ding)|bunch|but|by|c(an(('|no)?t)?|ould(n(')?t)?)|c(ome|omes|ame|ing)|call(s|ed|ing)?|car(e|es|ed|ing)|caus(e|es|ed|ing)|certain|certainly|chang(e|es|ed|ing)|check(s|ed|ing)?|cho(ose|oses|se|osing)|clear(s|ed|ing)?|click(s|ed|ing)?|clos(e|es|ed|ing)|collect(s|ed|ing)?|compar(e|es|ed|ing)|complet(e|es|ed|ing)|completely|cons|consider(s|ed|ing)?|constantly|content|continu(e|es|ed|ing)|control(led|ling)?|couple|creat(e|es|ed|ing)|current|currently|cut(s|ting)?|d(o(es)?(n(')?t)?|id(n(')?t)?|oing)|decid(e|es|ed|ing)|definitely|depend(s|ed|ing)?|depth|despite|different|done|down|drop(s|ped|ping)?|due|during|each|early|easier|easily|edit|either|else|end|enjoy(s|ed|ing)?|enough|entire|entirely|equip(s|ed|ping)?|especially|etc|even|eventually|ever|every|exactly|except|expect(s|ed|ing)?|extra|extremely|f(all|alls|ell|alling)|f(ight|ights|ought|ighting)|f(ind|inds|ound|inding)|fair|fairly|far|fe(el|els|lt|eling)|feature|few|figure|finally|finish(es|ed|ing)?|fir(ed|ing)|first|fix(es|ed|ing)?|focus|follow(s|ed|ing)?|for|forc(ed|ing)|form|forward|from|full|fully|further|g(et|ets|ot|etting)|g(ive|ives|ave|iving)|given|go(es|ing)?|went|guess(es|ed|ing)?|happen(s|ed|ing)?|have(n(')?t)?|having|had(n(')?t)?|has(n(')?t)?|he|hear(s|d)?|help(s|ed|ing)?|her|here|higher|highly|him|his|hit|hold|honestly|hop(e|es|ed|ing)|how|however|i|idea|if|im|in|in( )?fact|including|incredibly|inspire(s|d)?|instead|interested|into|is(n(')?t)?|are(n(')?t)?|am|was(n(')?t)?|were(n(')?t)?|issue|its|it's|jump(s|ed|ing)?|just|ke(ep|eps|pt|eping)|kind|kinda|kn(ow|ows|ew|owing)|lack(s|ed|ing)?|last|later|le(ave|aves|ft|aving)|learn(s|ed|ing)?|least|less|let|lets|lik(e|es|ed|ing)|likely|literally|lived|longer|look(s|ed|ing)?|los(e|es|t|ing)|lot|lots|lov(e|es|ed|ing)|low|m(ay|ight)|ma(ke|kes|de|king)|main|major|many|match|matter|maybe|me|mean(s|t|ing)?|mention(s|ed|ing)?|mind(s|ed|ing)?|minor|miss|missing|mix|more|most|mostly|mov(e|es|ed|ing)|much|multiple|must|my|myself|near|nearly|need(s|ed|ing)?|negative|never|new|next|no|none|not|note|nothing|now|number|of|off|offer|offers|often|oh|ok|okay|on|once|one|ones|only|open(s|ed|ing)?|option|or|order(s|ed|ing)?|other|others|otherwise|our|out|over|overall|own(s|ed|ing)?|pa(y|ys|id|ying)|pass|perfect(ed|ing)|perfectly|perhaps|personal|personally|pick(s|ed|ing)?|play(s|ed|ing)?|plenty|plus|point(ed|ing)|possible|previous|probably|pros|purchas(e|es|ed|ing)|put(ting)?|quickly|quite|r(un|uns|an|unning)|range|rather|rating|reach|read(s|ing)?|real|really|recommend(s|ed|ing)?|regret(s|ted|ting)?|releas(e|es|ed|ing)|remember(s|ed|ing)?|remind(s|ed|ing)?|replay(s|ed|ing)?|requir(e|es|ed|ing)|rest|right|s(ee|ees|aw|een|eeing)|sa(y|ys|id|ying)|sadly|same|sav(e|es|ed|ing)|second|seem(s|ed|ing)?|sens(e|es|ed|ing)|seriously|set|several|sh(oot|oots|ot|ooting)|should(n(')?t)?|show|shows|side|similar|simply|since|single|slightly|so|solve|some|someone|something|sometimes|somewhat|soon|sort|sounds|spen(d|ds|t|ding)|st(and|ands|ood|anding)|st(uck|ing)|start(s|ed|ing)?|stay(s|ed|ing)?|steam|still|stop(s|ed|ping)?|such|suggest|super|support(s|ed|ing)?|suppos(e|es|ed|ing)|sure|t(ake|akes|ook|aking)|t(ell|els|old|elling)|th(ink|inks|ought|inking)|than|thank(s|ed|ing)?|that|thats|the|their|them|themselves|then|there|these|they|thing|things|third|this|those|though|through|throughout|times|title|titles|to|together|tons|too|total|totally|towards|tr(y|ies|ied|ying)|truly|turn|turned|turns|u(se|ses|sed|sing)|under|underst(and|ands|ood|anding)|unfortunately|unless|unlike|until|up|upon|us(e|es|ed|ing)|usually|various|very|view|w(ill|on(')?t|ould(n(')?t)?)|w(in|ins|on|inning)|wait(s|ed|ing)?|walk(s|ed|ing)?|want(s|ed|ing)?|wast(e|es|ed|ing)|watch(es|ed|ing)?|we|well|went|what|whatever|when|where|whether|which|while|who|whole|why|wish(es|ed|ing)?|with(out)?|within|work(s|ed|ing)?|worse|worth|would|yeah|year|yes|yet|you|your|yourself)$/.test(term))
	{
		return true;
	}

	// Remove any mentions of the game's name
	if (getAppNameAsRegExp().test(term))
	{
		getAppNameAsRegExp().lastIndex = 0;
		return true;
	}
	else
	{
		getAppNameAsRegExp().lastIndex = 0;
	}
	
	return false;
}

////////////////////////////////////////////////////////////////////////////////
//
// showReviewCloud: Displays a ReviewCloud generated from the provided term
// counts.
//
////////////////////////////////////////////////////////////////////////////////
function showReviewCloud(termCounts)
{
	var cloudWordList = [];
	
	for (var term in termCounts)
	{
		var numberOfWordsInTerm = term.split(" ").length;
		var positiveCount = termCounts[term].positiveCount;
		var negativeCount = termCounts[term].negativeCount;
		var totalCount = positiveCount + negativeCount;
		if (totalCount <= 0)
		{
			continue;
		}
		
		var totalWeight = Math.pow(totalCount, 1 + (Math.log10(numberOfWordsInTerm) * MULTI_TERM_WEIGHTING));
		if (totalWeight <= 0)
		{
			continue;
		}
		
		var positivePercentage = (positiveCount / totalCount);
		var hue = (positivePercentage > 0.5 ? POSITIVE_TERM_HUE : NEGATIVE_TERM_HUE);
		var saturation = (positivePercentage > 0.5 ? positivePercentage : (1.0 - positivePercentage)) * MAXIMUM_TERM_SATURATION;
		
		cloudWordList.push({text: term, weight: totalWeight, hue: hue, saturation: saturation});
	}

	// Sort in descending order of frequency
	cloudWordList.sort(function(a,b)
	{
		return b.weight - a.weight;
	});

	cloudWordList = cloudWordList.slice(0, MAXIMUM_NUMBER_OF_TERMS_IN_CLOUD);

	for (var i = 0; i < cloudWordList.length; ++i)
	{
		logInfo(cloudWordList[i].text + " (" + cloudWordList[i].weight + ")");
		cloudWordList[i].weight = (Math.log(cloudWordList[i].weight) / Math.log(LOG_BASE)) + 1;
	}
		
	hideLoadingOverlay();

	$("#review_cloud").jQCloud(cloudWordList);
}

////////////////////////////////////////////////////////////////////////////////
//
// convertHSVToRGB: This function takes a (hue, saturation, value) tuple
// and converts it into a (red, blue, green) tuple.
//
// Adapted from http://schinckel.net/2012/01/10/hsv-to-rgb-in-javascript/
//
////////////////////////////////////////////////////////////////////////////////
var convertHSVToRGB = function(h, s, v)
{
	var rgb, i, data = [];
	
	if (s === 0)
	{
		rgb = [v,v,v];
	}
	
	else
	{
		h = h / 60;
		i = Math.floor(h);
		data = [v*(1-s), v*(1-s*(h-i)), v*(1-s*(1-(h-i)))];
		switch(i)
		{
			case 0: rgb = [v, data[2], data[0]]; break;
			case 1: rgb = [data[1], v, data[0]]; break;
			case 2: rgb = [data[0], v, data[2]]; break;
			case 3: rgb = [data[0], data[1], v]; break;
			case 4: rgb = [data[2], data[0], v]; break;
			default: rgb = [v, data[0], data[1]]; break;
		}
	}
	
	for (var i = 0; i < rgb.length; ++i)
	{
		rgb[i] = parseInt(rgb[i] * 255);
	}

	return rgb;
};

////////////////////////////////////////////////////////////////////////////////
//
// jQCloud Plugin for jQuery
// 
// Version 1.0.4
//
// Copyright 2011, Luca Ongaro
// Licensed under the MIT license.
//
// Date: 2013-05-09 18:54:22 +0200
//
////////////////////////////////////////////////////////////////////////////////
(function( $ ) {
  "use strict";
  $.fn.jQCloud = function(word_array, options) {
	// Reference to the container element
	var $this = this;
	// Namespace word ids to avoid collisions between multiple clouds
	var cloud_namespace = $this.attr('id') || Math.floor((Math.random()*1000000)).toString(36);

	// Default options value
	var default_options = {
	  width: $this.width(),
	  height: $this.height(),
	  center: {
		x: ((options && options.width) ? options.width : $this.width()) / 2.0,
		y: ((options && options.height) ? options.height : $this.height()) / 2.0
	  },
	  delayedMode: word_array.length > 50,
	  shape: false, // It defaults to elliptic shape
	  encodeURI: true,
	  removeOverflowing: true
	};

	options = $.extend(default_options, options || {});

	// Add the "jqcloud" class to the container for easy CSS styling, set container width/height
	$this.addClass("jqcloud").height(options.height);

	// Container's CSS position cannot be 'static'
	if ($this.css("position") === "static") {
	  $this.css("position", "relative");
	}

	var drawWordCloud = function() {
	  // Helper function to test if an element overlaps others
	  var hitTest = function(elem, other_elems) {
		// Pairwise overlap detection
		var overlapping = function(a, b) {
		  if (Math.abs(2.0*a.offsetLeft + (a.offsetWidth + TERM_SPACING) - 2.0*b.offsetLeft - (b.offsetWidth + TERM_SPACING)) < (a.offsetWidth + TERM_SPACING) + (b.offsetWidth + TERM_SPACING)) {
			if (Math.abs(2.0*a.offsetTop + (a.offsetHeight + TERM_SPACING) - 2.0*b.offsetTop - (b.offsetHeight + TERM_SPACING)) < (a.offsetHeight + TERM_SPACING) + (b.offsetHeight + TERM_SPACING)) {
			  return true;
			}
		  }
		  return false;
		};
		var i = 0;
		// Check elements for overlap one by one, stop and return false as soon as an overlap is found
		for(i = 0; i < other_elems.length; i++) {
		  if (overlapping(elem, other_elems[i])) {
			return true;
		  }
		}
		return false;
	  };

	  // Make sure every weight is a number before sorting
	  for (var i = 0; i < word_array.length; i++) {
		word_array[i].weight = parseFloat(word_array[i].weight, 10);
	  }

	  // Sort word_array from the word with the highest weight to the one with the lowest
	  word_array.sort(function(a, b) { if (a.weight < b.weight) {return 1;} else if (a.weight > b.weight) {return -1;} else {return 0;} });

	  var step = (options.shape === "rectangular") ? 18.0 : 2.0,
		  already_placed_words = [],
		  aspect_ratio = options.width / options.height;

	  // Function to draw a word, by moving it in spiral until it finds a suitable empty place. This will be iterated on each word.
	  var drawOneWord = function(index, word) {
		// Define the ID attribute of the span that will wrap the word, and the associated jQuery selector string
		var word_id = cloud_namespace + "_word_" + index,
			word_selector = "#" + word_id,
			angle = 6.28 * Math.random(),
			radius = 0.0,

			// Only used if option.shape == 'rectangular'
			steps_in_direction = 0.0,
			quarter_turns = 0.0,

			weight = 5,
			custom_class = "",
			inner_html = "",
			word_span;

		// Extend word html options with defaults
		word.html = $.extend(word.html, {id: word_id});

		// If custom class was specified, put them into a variable and remove it from html attrs, to avoid overwriting classes set by jQCloud
		if (word.html && word.html["class"]) {
		  custom_class = word.html["class"];
		  delete word.html["class"];
		}

		// Check if min(weight) > max(weight) otherwise use default
		if (word_array[0].weight > word_array[word_array.length - 1].weight) {
		  // Linearly map the original weight to a discrete scale from 1 to 10
		  weight = Math.round((word.weight - word_array[word_array.length - 1].weight) /
							  (word_array[0].weight - word_array[word_array.length - 1].weight) * 9.0) + 1;
		}

		word_span = $('<span>').attr(word.html).addClass(custom_class + " " + 'w' + weight);

		// Append link if word.url attribute was set
		if (word.link) {
		  // If link is a string, then use it as the link href
		  if (typeof word.link === "string") {
			word.link = {href: word.link};
		  }

		  // Extend link html options with defaults
		  if ( options.encodeURI ) {
			word.link = $.extend(word.link, { href: encodeURI(word.link.href).replace(/'/g, "%27") });
		  }

		  inner_html = $('<a>').attr(word.link).text(word.text);
		} else {
		  inner_html = word.text;
		}
		word_span.append(inner_html);

		// Bind handlers to words
		if (!!word.handlers) {
		  for (var prop in word.handlers) {
			if (word.handlers.hasOwnProperty(prop) && typeof word.handlers[prop] === 'function') {
			  $(word_span).bind(prop, word.handlers[prop]);
			}
		  }
		}

		$this.append(word_span);

		var width = word_span.width() + (TERM_PADDING * 2),
			height = word_span.height() + (TERM_PADDING * 2),
			left = options.center.x - width / 2.0,
			top = options.center.y - height / 2.0;

		// Save a reference to the style property, for better performance
		var word_style = word_span[0].style;
		word_style.position = "absolute";
		word_style.left = left + "px";
		word_style.top = top + "px";

		$("#" + word_id).hide().fadeIn(FADE_IN_TIME);

		if (word.hue)
		{
			var value = MINIMUM_TERM_VALUE + ((1.0 - MINIMUM_TERM_VALUE) * (weight/10));
			var rgb = convertHSVToRGB(word.hue, word.saturation, value);
			word_style.color = "rgb(" + rgb.join(",") + ")";
			word_style.background = "rgba(" + rgb.join(",") + "," + TERM_BACKGROUND_ALPHA + ")";
		}

		while(hitTest(word_span[0], already_placed_words)) {
		  // option shape is 'rectangular' so move the word in a rectangular spiral
		  if (options.shape === "rectangular") {
			steps_in_direction++;
			if (steps_in_direction * step > (1 + Math.floor(quarter_turns / 2.0)) * step * ((quarter_turns % 4 % 2) === 0 ? 1 : aspect_ratio)) {
			  steps_in_direction = 0.0;
			  quarter_turns++;
			}
			switch(quarter_turns % 4) {
			  case 1:
				left += step * aspect_ratio + Math.random() * 2.0;
				break;
			  case 2:
				top -= step + Math.random() * 2.0;
				break;
			  case 3:
				left -= step * aspect_ratio + Math.random() * 2.0;
				break;
			  case 0:
				top += step + Math.random() * 2.0;
				break;
			}
		  } else { // Default settings: elliptic spiral shape
			radius += step;
			angle += (index % 2 === 0 ? 1 : -1)*step;

			left = options.center.x - (width / 2.0) + (radius*Math.cos(angle)) * aspect_ratio;
			top = options.center.y + radius*Math.sin(angle) - (height / 2.0);
		  }
		  word_style.left = left + "px";
		  word_style.top = top + "px";
		}

		// Don't render word if part of it would be outside the container
		if (options.removeOverflowing && (left < 0 || top < 0 || (left + width) > options.width || (top + height) > options.height)) {
		  word_span.remove()
		  return;
		}

		already_placed_words.push(word_span[0]);

		// Invoke callback if existing
		if ($.isFunction(word.afterWordRender)) {
		  word.afterWordRender.call(word_span);
		}
	  };

	  var drawOneWordDelayed = function(index) {
		index = index || 0;
		if (!$this.is(':visible')) { // if not visible then do not attempt to draw
		  setTimeout(function(){drawOneWordDelayed(index);}, PER_TERM_DELAY_TIME);
		  return;
		}
		if (index < word_array.length) {
		  drawOneWord(index, word_array[index]);
		  setTimeout(function(){drawOneWordDelayed(index + 1);}, PER_TERM_DELAY_TIME);
		} else {
		  if ($.isFunction(options.afterCloudRender)) {
			options.afterCloudRender.call($this);
		  }
		}
	  };

	  // Iterate drawOneWord on every word. The way the iteration is done depends on the drawing mode (delayedMode is true or false)
	  if (options.delayedMode){
		drawOneWordDelayed();
	  }
	  else {
		$.each(word_array, drawOneWord);
		if ($.isFunction(options.afterCloudRender)) {
		  options.afterCloudRender.call($this);
		}
	  }
	};

	// Delay execution so that the browser can render the page before the computatively intensive word cloud drawing
	setTimeout(function(){drawWordCloud();}, PER_TERM_DELAY_TIME);
	return $this;
  };
})(jQuery);

GM_addStyle('div.jqcloud { font-size: ' + DEFAULT_FONT_SIZE + 'px;  line-height: normal; }');
GM_addStyle('div.jqcloud a { font-size: inherit;  text-decoration: none; }');
GM_addStyle('div.jqcloud { overflow: hidden;  position: relative; }');
GM_addStyle('div.jqcloud span { padding: ' + TERM_PADDING + 'px; -webkit-border-radius: ' + ROUNDED_CORNER_RADIUS + 'px; border-radius: ' + ROUNDED_CORNER_RADIUS + 'px; -moz-border-radius: ' + ROUNDED_CORNER_RADIUS + 'px; white-space: nowrap; }');

for (var i = 0; i < 10; ++i)
{
	GM_addStyle('div.jqcloud span.w' + (i + 1) + ' { font-size: ' + (100 + (FONT_SIZE_PERCENT_INCREASE_PER_LEVEL * i)) + '%; }');
}
