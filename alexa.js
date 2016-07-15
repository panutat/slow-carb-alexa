var http = require( 'http' );

// Route the incoming request based on type (LaunchRequest, IntentRequest,
// etc.) The JSON body of the request is provided in the event parameter.
exports.handler = function (event, context) {
    try {
        console.log("event.session.application.applicationId=" + event.session.application.applicationId);

        if (event.session.application.applicationId !== "XXXXXXXXXXXXXXXXXXXXXX") {
             context.fail("Invalid Application ID");
        }

        if (event.session.new) {
            onSessionStarted({requestId: event.request.requestId}, event.session);
        }

        if (event.request.type === "LaunchRequest") {
            onLaunch(event.request, event.session,
                function callback(sessionAttributes, speechletResponse) {
                    context.succeed(buildResponse(sessionAttributes, speechletResponse));
                });
        } else if (event.request.type === "IntentRequest") {
            onIntent(event.request, event.session,
                function callback(sessionAttributes, speechletResponse) {
                    context.succeed(buildResponse(sessionAttributes, speechletResponse));
                });
        } else if (event.request.type === "SessionEndedRequest") {
            onSessionEnded(event.request, event.session);
            context.succeed();
        }
    } catch (e) {
        context.fail("Exception: " + e);
    }
};

/**
 * Called when the session starts.
 */
function onSessionStarted(sessionStartedRequest, session) {
    console.log("onSessionStarted requestId=" + sessionStartedRequest.requestId + ", sessionId=" + session.sessionId);
}

/**
 * Called when the user launches the skill without specifying what they want.
 */
function onLaunch(launchRequest, session, callback) {
    console.log("onLaunch requestId=" + launchRequest.requestId + ", sessionId=" + session.sessionId);

    // Dispatch to your skill's launch.
    getWelcomeResponse(callback);
}

/**
 * Called when the user specifies an intent for this skill.
 */
function onIntent(intentRequest, session, callback) {
    console.log("onIntent requestId=" + intentRequest.requestId + ", sessionId=" + session.sessionId);

    var intent = intentRequest.intent,
        intentName = intentRequest.intent.name;

    // Dispatch to your skill's intent handlers
    if ("SlowCarbCheck" === intentName) {
        checkFood(intent, session, callback);
    } else if ("AMAZON.HelpIntent" === intentName) {
        getHelpResponse(callback);
    } else if ("AMAZON.StopIntent" === intentName || "AMAZON.CancelIntent" === intentName) {
        handleSessionEndRequest(callback);
    } else {
        throw "Invalid intent";
    }
}

/**
 * Called when the user ends the session.
 * Is not called when the skill returns shouldEndSession=true.
 */
function onSessionEnded(sessionEndedRequest, session) {
    console.log("onSessionEnded requestId=" + sessionEndedRequest.requestId + ", sessionId=" + session.sessionId);
    // Add cleanup logic here
}

// --------------- Functions that control the skill's behavior -----------------------

function getWelcomeResponse(callback) {
    // If we wanted to initialize the session to have some attributes we could add those here.
    var sessionAttributes = {};
    var cardTitle = "Welcome";
    var speechOutput = "Welcome to the Slow Carb Checker. Ask me what food you can eat or drink. For example, say, can I eat apples?";

    // If the user either does not reply to the welcome message or says something that is not
    // understood, they will be prompted again with this text.
    var repromptText = "Ask me what food you can eat or drink. For example, say can I eat apples?";
    var shouldEndSession = false;

    callback(sessionAttributes, buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession, false));
}

function getHelpResponse(callback) {
    // If we wanted to initialize the session to have some attributes we could add those here.
    var sessionAttributes = {};
    var cardTitle = "Help";
    var speechOutput = "Need help? Ask me what food you can eat or drink on the Slow Card Diet. For example, say, can I eat apples? or say, can I drink almond milk?";

    // If the user either does not reply to the welcome message or says something that is not
    // understood, they will be prompted again with this text.
    var repromptText = "Ask me what food you can eat or drink. For example, say can I eat apples?";
    var shouldEndSession = false;

    callback(sessionAttributes, buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession, false));
}

function handleSessionEndRequest(callback) {
    var cardTitle = "Session Ended";
    var speechOutput = "Thank you for using the Slow Carb Checker. Have a nice day!";
    // Setting this to true ends the session and exits the skill.
    var shouldEndSession = true;

    callback({}, buildSpeechletResponse(cardTitle, speechOutput, null, shouldEndSession, false));
}

/**
 * Check to see if the Food provide is allowed
 */
function checkFood(intent, session, callback) {
    var cardTitle = intent.name;
    var consumeActionSlot = intent.slots.ConsumeAction;
    var foodSlot = intent.slots.Food;

    var sessionAttributes = {};
    var repromptText = "";
    var shouldEndSession = false;
    var speechOutput = "";

    var allowedConsumeActions = ["eat", "drink", "have", "consume", "sip", "swallow"];

    // Check if consumeAction is valid
    if (consumeActionSlot && consumeActionSlot.value && allowedConsumeActions.indexOf(consumeActionSlot.value) > -1) {

        // Check if food is valid
        if (foodSlot && foodSlot.value && foodSlot.value.length > 0) {
            var consumeAction = consumeActionSlot.value;
            var food = foodSlot.value;

            var url = 'http://www.eslowcarbdiet.com/' + food.replace(/\s+/g, '-').toLowerCase() + '/';

            http.get(url, function(response) {
                var html = '';
                response.on('data', function(data) {
                    html += data;
                });
                response.on('end', function() {
                    html = html.replace(/\n/g, '');
                    html = html.replace(/\r/g, '');
                    html = html.replace(/\t/g, '');
                    html = html.replace(/\"/g, '');
                    html = html.replace(/  +/g, '');

                    var pattern = /<div class=entry-content><p>(.*?)<\/p>/g;
                    var match = pattern.exec(html);
                    var result = match[1].replace(/ &#8211;/g, '');
                    result = result.replace(/<(?!\/?b>|\/?strong>)[^>]+>/g, '');

                    if (result != "Apologies, but the page you requested could not be found. Perhaps searching will help.") {
                        sessionAttributes = createFoodAttributes(consumeAction, food);
                        speechOutput = result;
                        repromptText = "Ask me what food you can eat or drink. For example, say, can I eat apples?";
                        shouldEndSession = true;

                        callback(sessionAttributes, buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession, false));
                    } else {
                        speechOutput = "I don't have any information on that food item. Please try again.";
                        repromptText = "Ask me what food you can eat or drink. For example, say, can I eat apples?";

                        callback(sessionAttributes, buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession, false));
                    }
                });
            });
        } else {
            speechOutput = "I don't have any information on that food item. Please try again.";
            repromptText = "Ask me what food you can eat or drink. For example, say, can I eat apples?";

            callback(sessionAttributes, buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession, false));
        }
    } else {
        speechOutput = "I could not understand your request. Please try again.";
        repromptText = "Ask me what food you can eat or drink. For example, say, can I eat apples?";

        callback(sessionAttributes, buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession, false));
    }
}

function createFoodAttributes(consumeAction, food) {
    return {
        consumeAction: consumeAction,
        food: food
    };
}

// --------------- Helpers that build all of the responses -----------------------

function buildSpeechletResponse(title, output, repromptText, shouldEndSession, sendCard) {
    if (sendCard) {
        return {
            outputSpeech: {
                type: "PlainText",
                text: output
            },
            card: {
                type: "Simple",
                title: "Slow Carb Checker",
                content: "Response: " + output
            },
            reprompt: {
                outputSpeech: {
                    type: "PlainText",
                    text: repromptText
                }
            },
            shouldEndSession: shouldEndSession
        };
    } else {
        return {
            outputSpeech: {
                type: "PlainText",
                text: output
            },
            reprompt: {
                outputSpeech: {
                    type: "PlainText",
                    text: repromptText
                }
            },
            shouldEndSession: shouldEndSession
        };
    }
}

function buildResponse(sessionAttributes, speechletResponse) {
    return {
        version: "1.0",
        sessionAttributes: sessionAttributes,
        response: speechletResponse
    };
}