// ==UserScript==
// @name		ReviewCloud for Steam
// @author		Cody Watts
// @namespace	http://www.codywatts.com/reviewcloudforsteam
// @homepage	http://www.codywatts.com/reviewcloudforsteam
// @updateURL	https://www.codywatts.com/reviewcloudforsteam/reviewcloudforsteam.meta.js
// @downloadURL	https://www.codywatts.com/reviewcloudforsteam/reviewcloudforsteam.user.js
// @version		1.0.1
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
var EXPECTED_NUMBER_OF_REVIEWS_RECEIVED_PER_REQUEST = 5; // This is the number of reviews we expect to receive per request to the Steam servers.
var DAY_RANGE = 720; // Exclude any reviews older than this many days.

////////////////////////////////////////////////////////////////////////////////
// AESTHETIC PROPERTIES
////////////////////////////////////////////////////////////////////////////////
var REVIEW_CLOUD_HEIGHT = 350; // The height of the ReviewCloud in pixels.
var DEFAULT_FONT_SIZE = 10; // The font size of the smallest text in the ReviewCloud in pixels.
var FONT_SIZE_PERCENT_INCREASE_PER_LEVEL = 35; // The percentage increase in font size between "levels" in the ReviewCloud.
var MAXIMUM_NUMBER_OF_WORDS_IN_CLOUD = 100; // The maximum number of words which will appear in the cloud.
var PER_WORD_DELAY_TIME = 4; // The delay between the appearance of each word in the ReviewCloud (in milliseconds.)
var PER_WORD_PADDING = 3; // The padding between words in the ReviewCloud, in pixels.
var SPINNER_SIZE = (REVIEW_CLOUD_HEIGHT * 0.75); // The size of the loading spinner, in pixels.
var FADE_OUT_TIME = 500; // How quickly the "loading" overlay fades out (in milliseconds.)
var FADE_IN_TIME = 300; // How quickly the ReviewCloud fades in (in milliseconds.)
var POSITIVE_WORD_HUE = 205; // The hue used to render words which have a 100% positive association.
var NEGATIVE_WORD_HUE = 5; // The hue used to render words which have a 100% negative association.
var MAXIMUM_WORD_SATURATION = 0.5; // The maximum saturation value used to render words.
var MINIMUM_WORD_VALUE = 0.55; // The minimum intensity value used to render words. Words with greater weight are rendered with higher intensity values.

////////////////////////////////////////////////////////////////////////////////
// "GLOBAL VARIABLES"
////////////////////////////////////////////////////////////////////////////////
var g_reviews = new Array();
var g_numberOfOutstandingRequestsMadeToSteamServers = NUMBER_OF_REQUESTS_FOR_ADDITIONAL_REVIEWS;

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
	
	var allReviewsDiv = document.getElementById("Reviews_all");
	if (allReviewsDiv != null)
	{
		extractReviewData(allReviewsDiv);
	}
	else
	{
		logError("Could not find a page element with id \"Reviews_all\". Reviews on the first page will not be included in the ReviewCloud.");
	}
	
	for (var i = 0; i < NUMBER_OF_REQUESTS_FOR_ADDITIONAL_REVIEWS; ++i)
	{
		requestReviewsFromServer((i + 1) * EXPECTED_NUMBER_OF_REVIEWS_RECEIVED_PER_REQUEST);
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
		logError("Could not find a page element with id \"main_content\". The ReviewCloud will not be displayed.");
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
	gameDescriptionColumnElement.insertBefore(reviewCloudHeaderElement, userReviewsHeaderElement);

	var reviewCloudContainerElement = document.createElement('div');
	reviewCloudContainerElement.setAttribute("id", "review_cloud");
	reviewCloudContainerElement.setAttribute("class", "game_area_description");
	reviewCloudContainerElement.style.height = REVIEW_CLOUD_HEIGHT + 'px';
	reviewCloudContainerElement.style.position = 'relative';
	reviewCloudContainerElement.style.display = 'block';
    reviewCloudContainerElement.style.minWidth = $('#game_area_description').width() + 'px';
	reviewCloudHeaderElement.appendChild(reviewCloudContainerElement);
	
	return reviewCloudContainerElement;
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
		return null;
	}
	
    return mainContentElement[0];
}

////////////////////////////////////////////////////////////////////////////////
//
// showLoadingOverlay: Displays an animated "loading" overlay while the word
// cloud is being generated.
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
// hideLoadingOverlay: Fades out the "loading" overlay when the word cloud is
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
				getAppName.appName = appNameDiv[0].innerHTML.trim();	
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
		var uniqueWordsInAppName = getUniqueWords(getAppName().toLowerCase());
		var pipeDelimitedAppName = Object.keys(uniqueWordsInAppName).join('|');
		getAppNameAsRegExp.regularExpression = new RegExp('^(' + pipeDelimitedAppName + ')$', 'g');
    }

	return getAppNameAsRegExp.regularExpression;
}

////////////////////////////////////////////////////////////////////////////////
//
// requestReviewsFromServer: Requests reviews from the Steam servers starting
// at the specified offset.
//
////////////////////////////////////////////////////////////////////////////////
function requestReviewsFromServer(startOffset)
{
    var requestURL = "http://store.steampowered.com/appreviews/" + getAppID() + "?start_offset=" + startOffset + "&day_range=" + DAY_RANGE + "&filter=all"
    logInfo("Requesting reviews starting at offset " + startOffset + " via: " + requestURL);

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
	var wordCounts = {};

    for (var i = 0; i < g_reviews.length; ++i)
    {
		var review = g_reviews[i];

		// Steam censors swears in reviews by replacing them with hearts, which can ♥♥♥♥ up the analysis. Get rid of any of those.
		review.text = review.text.replace(/(\u2665\w*)/g, '');

		// Change the text to lowercase.
		review.text = review.text.toLowerCase();
		
		// Replace apostrophe-like characters with apostrophes
		review.text = review.text.replace(/[’´]/g, '\'');

		// Remove any trailing "'s" on words.
		review.text = review.text.replace(/'s/g, '');

		var uniqueWordsInThisReview = getUniqueWords(review.text);
		
        // Go over the set of unique words in this review and increment their counts in the "wordCounts" array
    	for (var word in uniqueWordsInThisReview)
    	{
            if (word in wordCounts == false)
            {
                wordCounts[word] = {negativeCount: 0, positiveCount: 0};
            }
            
            if (review.isPositive)
            {              
            	wordCounts[word].positiveCount++;
			}
            else
            {
                wordCounts[word].negativeCount++;
            }
        }
    }

    for (var word in wordCounts)
    {
		if (shouldBeFiltered(word))
		{
			delete wordCounts[word];
		}
    }
	
	consolidateSimilarWords(wordCounts);
	
	showReviewCloud(wordCounts);
}

////////////////////////////////////////////////////////////////////////////////
//
// consolidateSimilarWords: This function takes words which are similar (e.g.
// "zombie" and "zombies") and merges them together in order to give them more
// accurate representation within the ReviewCloud.
//
////////////////////////////////////////////////////////////////////////////////
function consolidateSimilarWords(wordCounts)
{
	logInfo("Consolidating similar words...");
	
	// This is a very rudimentary, naive approach to detecting pluralization.
	// A more robust approach can be found at http://www.csse.monash.edu.au/~damian/papers/HTML/Plurals.html	
	var pluralizationSchemeSchemes =
	[
		{ regex: /^(.*?)s$/, singularEndings: [''] }, // Dogs, etc.
		{ regex: /^(.*?)ies$/, singularEndings: ['y', 'ie'] }, // Puppies, zombies, etc.
		{ regex: /^(.*?)shes$/, singularEndings: ['sh'] }, // Bushes, etc.
		{ regex: /^(.*?)ches$/, singularEndings: ['ch'] }, // Churches, etc.
		{ regex: /^(.*?)oes$/, singularEndings: ['o'] }, // Tomatoes, etc.
		{ regex: /^(.*?)ves$/, singularEndings: ['ve', 'f'] } // Objectives, wolves, etc.
	]
			
	for (var word in wordCounts)
    {
		// If the word ends with 's'...
		if (/s$/.test(word))
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

						if (singularForm in wordCounts)
						{
							foundSingularForm = true;
							
							var singularTotalCount = wordCounts[singularForm].positiveCount + wordCounts[singularForm].negativeCount;
							var pluralTotalCount = wordCounts[pluralForm].positiveCount + wordCounts[pluralForm].negativeCount;
							
							if (pluralTotalCount >= singularTotalCount)
							{
								logInfo("Merging \"" + singularForm + "\" (" + singularTotalCount + ") into \"" + pluralForm + "\" (" + pluralTotalCount + ").");
								
								wordCounts[pluralForm].positiveCount += wordCounts[singularForm].positiveCount;
								wordCounts[pluralForm].negativeCount += wordCounts[singularForm].negativeCount;
								
								delete wordCounts[singularForm];
							}
							else
							{
								logInfo("Merging \"" + pluralForm + "\" (" + pluralTotalCount + ") into \"" + singularForm + "\" (" + singularTotalCount + ").");
								
								wordCounts[singularForm].positiveCount += wordCounts[pluralForm].positiveCount;
								wordCounts[singularForm].negativeCount += wordCounts[pluralForm].negativeCount;
								
								delete wordCounts[pluralForm];
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
			reviewText = reviewContentElement[0].textContent;
			reviewText = stripURLs(reviewText);
			reviewText = reviewText.trim();
		}

		g_reviews.push({text: reviewText, isPositive: reviewIsPositive});
	}
}

////////////////////////////////////////////////////////////////////////////////
//
// getUniqueWords: Takes a string, and returns a list of the unique words in
// that string.
//
////////////////////////////////////////////////////////////////////////////////
function getUniqueWords(text)
{
	// Split the text on all non-word characters, except for hyphens, apostrophes, ampersands and slashes.
	var words = text.split(/[^\w-'&\\\/]+/);
	
	var uniqueWords = {};
	
	// Go over all the words in this review and find the set of unique words.
	for (var j = 0; j < words.length; j++)
	{
		var word = words[j];
		
		if (word.length == 0)
		{
			continue;
		}

		if (word in uniqueWords == false)
		{
			uniqueWords[word] = true;
		}
	}
	
	return uniqueWords;
}

////////////////////////////////////////////////////////////////////////////////
//
// shouldBeFiltered: This function takes a word as input and returns true or
// false, indicating whether that word should be excluded from the ReviewCloud.
// Certain words are filtered in order to make the ReviewCloud more meaningful.
//
////////////////////////////////////////////////////////////////////////////////
function shouldBeFiltered(word)
{
	// Remove any word which contains an apostrophe (e.g. don't, can't, i've, should've) because those words aren't interesting.
	if (/['’´]/.test(word))
	{
		return true;
	}

	// Remove any words which is fewer than two letters or greater than twenty letters.
	if (word.length < 2 || word.length > 20)
	{
		return true;
	}
	
	// Remove any words which contain only numbers
	if (/^\d+$/.test(word))
	{
		return true;
	}
	
	// Remove anything that start with "game" or "play" (because they pop up in almost every review.)
	if (/^(game|play)/.test(word))
	{
		return true;
	}
	
	// Filter out a variety of common English words.
	if (/^(a|able|aboard|about|above|abroad|absolutely|according|accurately|across|act(s|ed|ing)?|action|actively|actually|add|addition|adjective|admittedly|afraid|after|afterward|again|against|ago|agreed|ah|ahead|alike|all|allegedly|allow|almost|along|alongside|alot|already|also|although|altogether|always|am|amid|among|amount|an|and|and\/or|angle|annually|another|answer|any|anybody|anymore|anyone|anything|anyway|anywhere|apart|apparently|appear|approximately|are|area|arms|around|arrived|as|aside|ask|at|atop|automatically|away|back|bad|badly|barely|basically|be|became|because|become|been|before|began|begin|behalf|behind|being|believe|belong|below|beneath|beside|besides|best|better|between|beyond|big|bill|bit|born|both|bottom|break|briefly|bring|brought|but|buy|by|call|call(s|ed|ing)?|came|can|cannot|can't|capital|captain|care|carefully|carry|case|catch|caught|cause|certain|certainly|chance|change|charge|choose|clearly|climbed|close|closely|com(e|es|ing)|come|common|commonly|compare|complete|completely|compound|concerning|conditions|consequently|consider|considerably|consistently|constantly|contain|continued|correct|correctly|cost|could|couldn't|count|country|course|covered|create|cross|crowd|current|currently|cut|daily|day(s)?|decided|deeply|definitely|deliberately|depending|describe|design|desperately|despite|details|determine|developed|did|didn't|died|difference|different|differently|direct|directly|discovered|distance|divided|division|do|does|doesn't|done|dont|don't|down|dozen|dramatically|draw|drawing|drive|dry|due|during|each|early|easily|east|easy|eat|economically|edge|effect|effectively|eight|eighth|either|electric|elements|eleven|else|elsewhere|emotionally|end|energy|enjoy|enough|entered|entire|entirely|equal|equally|equation|especially|essentially|etc|even|evening|eventually|ever|every|everybody|everyone|everything|everywhere|exactly|example|except|excepting|exclusively|exercise|expect|explain|express|extremely|fairly|fall|false|famous|far|fast|favor|feel(s)?|feeling|fell|felt|few|fewer|fifteen|fifth|fifty|filled|finally|find|fine|finished|firmly|first|fit|five|flat|flow|follow|for|force|forever|form|former|formerly|forth|fortunately|forty|forward|found|four|fourth|frankly|freely|frequently|fresh|from|front|full|fully|furthermore|gave|general|generally|gently|get(s|ting)?|got|giv(e|es|ing)|gave|go(es|ing)?|gone|good|gradually|greatly|grew|ground|group|grow|guess|ha|half|halfway|halt|happened|happily|happy|hardly|hav(e|ing)|has|had|he|hear(s|d)?|heavily|heavy|held|hello|help(s|ed|ing)?|hence|her|here|hers|herself|hey|hi|high|highly|him|himself|his|historically|hit|hold|honestly|hopefully|hours|how|however|huge|huh|hundred|i|idea|ie|if|i'll|immediately|important|importantly|in|includ(e|es|ed|ing)|increas(e|es|ed|ing)|increasingly|incredibly|indeed|indicat(e|es|ed|ing)|inevitably|information|initially|inside|instantly|instead|interest|into|ironically|is|isn't|it|its|it's|itself|joined|jumped|just|keep|kept|killed|kind|kinda|know|knowing|knew|known|large|largely|last|late|lately|later|latter|lay|lead|learn(s|ed|ing)?|least|leav(e|es|ing)|left|led|legally|length|less|let(s)?|let's|lifted|lightly|like|likely|likewise|listen(s|ed|ing)?|literally|little|live|located|long|look(s|ed|ing)?|lot|lots|loud|low|main|mainly|major|mak(e|es|ing)|made|manag(e|es|ed|ing)|many|march|mark|match|matter|may|maybe|me|mean|meanwhile|measure|meet|melody|members|mentally|merely|method|middle|might|million|mind|mine|minute(s)?|miss|moment|month(s)?|more|moreover|most|mostly|move|much|must|my|myself|near|nearby|nearly|necessarily|necessary|need(s|ing|ed)?|neither|never|nevertheless|new|newly|next|nine|ninth|no|nobody|none|nonetheless|nor|normally|not|note|nothing|notice|noun|now|nowhere|number|object|observ(e|es|ing|ed)|obviously|occasionally|o'clock|of|off|officially|often|oh|ok|okay|old|on|once|one(s)?|one-third|only|onto|open|openly|opposed|opposite|or|order|originally|other|others|otherwise|our|ours|ourselves|out|outside|over|overall|overnight|own|pair|part|partially|particular|particularly|particulary|partly|passed|pay|people|per|perfectly|perhaps|personally|physically|pick(s|ed|ing)?|picked|place(s)?|play|please|plenty|plus|pm|point|politically|position|possible|possibly|potentially|pounds|practically|practice|precisely|prepared|presumably|previously|primarily|printed|prior|privately|probably|produce|properly|property|provid(e|es|ing|ed)|public|publicly|pulled|pushed|put|quickly|quiet|quietly|quite|raised|ran|rapidly|rarely|rather|re|reached|read|readily|ready|really|received|recently|record|regard|regarding|regardless|regularly|relatively|remain|remember|repeated|repeatedly|report|reportedly|represent|resent|respect|respectively|response|rest|return|review(s|ing|ed|er)?|rich|ride|right|rise|rolled|roughly|round|routinely|row|rule|run|safe|safely|said|sail|same|sat|save|saw|say|scale|second|second(s)?|section|see|seeds|seem|seemingly|seen|seldom|sell|send|sense|sent|sentence|separate|seriously|serve|set|settled|seven|seventh|several|severely|shall|sharp|sharply|she|shop|short|shortly|should|shoulder|shouted|show|shown|side|sight|sign|signal|significantly|silent|similar|similarly|simple|simply|simultaneously|since|sing|sir|sit|six|sixth|size|sleep|slightly|slowly|small|smell|smil(e|es|ed|ing)|so|socially|soft|softly|solely|solution|some|somebody|someday|somehow|someone|something|sometime|sometimes|somewhat|somewhere|soon|south|speak(s|ing)|spoke|special|specifically|spell|spite|spot|spread|spring|stand|stars|start|state|stay|steadily|steel|step|stick|still|stood|stop|straight|strange|stream|stretched|strictly|strong|strongly|study|stuff|substantially|successfully|such|sudden|suddenly|suggest(s|ed|ing)?|sum|suppose|supposedly|sure|surely|surprisingly|syllables|system|tak(e|es|ing)|tak(e|es|ing)|took|talk(s|ed|ing)?|tall|tell|ten|tenth|terms|terribly|than|that|the|their|theirs|them|themselves|then|there(s)?|thereby|therefore|these|they|thick|thin|thing(s)?|think|third|thirty|this|thoroughly|those|though|thought|thousand(s)?|three|through|throughout|thus|tied|tight|tightly|till|time|tiny|to|together|told|tone|tonight|too|took|top|total|totally|touch|toward|towards|tr(y|ies|ied|ing)|traditionally|travel|trip|trouble|true|truly|twelve|twentieth|twenty|twice|two|type|typically|uh|ultimately|under|underneath|understand|unfortunately|unless|unlike|until|unto|up|upon|us|us(e|es|ed|ing)?|usually|value|various|versus|very|via|view|virtually|visit(s|ed|ing)?|vs|wait(s|ed|ing)?|walk(s|ed|ing)?|wall|want|warm|was|wash(es|ed|ing)?|wasn't|watch|way|way(s)?|we|wear|week(s)?|well|we'll|went|were|west|what|whatever|when|whenever|where|whereas|wherever|whether|which|whichever|while|white|who|whoever|whole|whom|whomever|whose|why|wide|widely|wild|will|win|wish(es|ing|ed)?|with|within|without|wonder|wont|won't|work|worth|would|wouldn't|wow|writ(e|es|ing)|wrote|written|wrong|yeah|year(s)?|yes|yet|you|young|your|youre|you're|yours|yourself|yourselves|zero|)$/g.test(word))
	{
		return true;
	}

	// Remove any mentions of the game's name
	if (getAppNameAsRegExp().test(word))
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
// showReviewCloud: Displays a ReviewCloud generated from the provided word
// counts.
//
////////////////////////////////////////////////////////////////////////////////
function showReviewCloud(wordCounts)
{
	var cloudWordList = new Array();
	
	for (var word in wordCounts)
    {
		var positiveCount = wordCounts[word].positiveCount;
		var negativeCount = wordCounts[word].negativeCount;
		var totalCount = positiveCount + negativeCount;
		
		var positivePercentage = (positiveCount / totalCount);
        if (positivePercentage > 0.5)
        {
            var hue = POSITIVE_WORD_HUE;
            var saturation = positivePercentage;
        }
        else
        {
            var hue = NEGATIVE_WORD_HUE;
            var saturation = (1.0 - positivePercentage);
        }
        
        saturation = saturation * MAXIMUM_WORD_SATURATION;
		
		cloudWordList.push({text: word, weight: totalCount, hue: hue, saturation: saturation});
    }

	// Sort in descending order of frequency
	cloudWordList.sort(function(a,b)
	{
		if (a.weight == b.weight)
		{
			return 0;
		}

		return (a.weight > b.weight ? -1 : 1);
	});

	cloudWordList = cloudWordList.slice(0, MAXIMUM_NUMBER_OF_WORDS_IN_CLOUD);
	
	for (var i = 0; i < cloudWordList.length; ++i)
    {
		logInfo(cloudWordList[i].text + " (" + cloudWordList[i].weight + ")");
    }
		
	hideLoadingOverlay();

	$("#review_cloud").jQCloud(cloudWordList);
}

////////////////////////////////////////////////////////////////////////////////
//
// convertHSVToRGB: This function takes a (hue, saturation, value) triplet and
// converts it into a hexadecimal representation of a (red, blue, green) color.
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
	
	var hexadecimalString = rgb.map(function(x) { return ("0" + Math.round(x*255).toString(16)).slice(-2); }).join('');
	
	return '#' + hexadecimalString;
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
          if (Math.abs(2.0*a.offsetLeft + (a.offsetWidth + PER_WORD_PADDING) - 2.0*b.offsetLeft - (b.offsetWidth + PER_WORD_PADDING)) < (a.offsetWidth + PER_WORD_PADDING) + (b.offsetWidth + PER_WORD_PADDING)) {
            if (Math.abs(2.0*a.offsetTop + (a.offsetHeight + PER_WORD_PADDING) - 2.0*b.offsetTop - (b.offsetHeight + PER_WORD_PADDING)) < (a.offsetHeight + PER_WORD_PADDING) + (b.offsetHeight + PER_WORD_PADDING)) {
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

        var width = word_span.width(),
            height = word_span.height(),
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
            var value = MINIMUM_WORD_VALUE + ((1.0 - MINIMUM_WORD_VALUE) * (weight/10));
			word_style.color = convertHSVToRGB(word.hue, word.saturation, value);
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
          setTimeout(function(){drawOneWordDelayed(index);},PER_WORD_DELAY_TIME);
          return;
        }
        if (index < word_array.length) {
          drawOneWord(index, word_array[index]);
          setTimeout(function(){drawOneWordDelayed(index + 1);}, PER_WORD_DELAY_TIME);
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
    setTimeout(function(){drawWordCloud();}, PER_WORD_DELAY_TIME);
    return $this;
  };
})(jQuery);

GM_addStyle('div.jqcloud { font-size: ' + DEFAULT_FONT_SIZE + 'px;  line-height: normal; }');
GM_addStyle('div.jqcloud a { font-size: inherit;  text-decoration: none; }');
GM_addStyle('div.jqcloud { overflow: hidden;  position: relative; }');
GM_addStyle('div.jqcloud span { padding: 0; }');

for (var i = 0; i < 10; ++i)
{
	GM_addStyle('div.jqcloud span.w' + (i + 1) + ' { font-size: ' + (100 + (FONT_SIZE_PERCENT_INCREASE_PER_LEVEL * i)) + '%; }');
}
