# Clarity PCF
A lightweight Power Apps PCF component that integrates Microsoft Clarity session tracking, metadata tagging, and custom event logging directly into Canvas Apps and Model-Driven Apps.

This control is designed to run invisibly, initialize Clarity automatically, respect consent, and send consistent metadata and events from your environment to Clarity.


✨ Features

✔ Fully automatic Clarity initialization using your Clarity Project ID

✔ Consent-aware tracking (trackingAllowed parameter controls Clarity.consent)

✔ App-environment tagging (appName, environment, custom tags)

✔ Custom event logging triggered from Power Apps formulas

✔ Works in both Canvas and Model-Driven apps

✔ Safe initialization & idempotent logic

✔ Debug logging mode to inspect behaviour at runtime


🛠 How It Works

The control uses the official Microsoft Clarity NPM package.

When it loads it checks:

disable flag (tecnical killswitch)

trackingAllowed parameter (Won't run without consent)

presence of a valid clarityProjectId


It identifies the session and sets base metadata:

userId

userEmail

userName

screenName

appName

environment

It applies any custom tags from JSON input.

It listens for eventTriggerToken changes.

The control stays hidden (display:none) and only runs script logic.


📦 Installation
Directly download the managed or unmanaged solutions avaliable and import them to your environment!

If you want to make changes:
1. Clone the repository
git clone https://github.com/<your-repo>/scn-clarity-tracker.git
cd scn-clarity-tracker

2. Install dependencies
npm install

3. Build the PCF control
npm run build

4. Pack into a solution
pac solution init --publisher-name "SCN" --publisher-prefix "scn"
pac solution add-reference --path ./SCNClarityTracker
pac solution pack --output-file ClarityTrackerSolution.zip

5. Import into Power Apps

Go to Power Apps → Solutions

Import ClarityTrackerSolution.zip

Publish all customizations

🧩 Usage in Canvas Apps

You have to make shure your enviroment has code components enabled.
Insert the PCF component onto every screen you want tracked.

Bind inputs:

Parameter	Required	Description
clarityProjectId	✔	Your Clarity Project ID (ub816oj6x7 etc.)
trackingAllowed	✔	If false → no tracking / consent revoked
disable	optional	Turns off Clarity entirely
userId	optional	Defaults to Power Apps user
userName	optional	Defaults to Power Apps user
userEmail	optional	Optional user email
sessionId	optional	Use your own session correlation if desired
screenName	optional	Defaults to URL of the app
appName	optional	Defaults to last URL segment
environment	optional	Auto-detected: DEV / TEST / PROD
sessionTagsJson	optional	JSON object of tags { "Role": "Admin" }
Logging an event

In Power Apps:

Set(
    varEventToken,
    Now().UTCText
);

UpdateContext({
    eventName: "ButtonClicked",
    eventDataJson: "{""button"": ""Save""}"
});


Bind:

eventTriggerToken → varEventToken

eventName

eventDataJson

Changing the token triggers a new event.

🧩 Usage in Model-Driven Apps

This same PCF works inside Model-Driven forms.

Add it to any form as a field control

Bind the same parameters (at least clarityProjectId + trackingAllowed)

Publish the form

Clarity will run inside the model-driven shell and track navigation, form loads, and events exactly as it does in canvas.

Note:
screenName will default to the form’s URL unless you override it with something like:

"CaseForm-Main"

🧪 Debug Mode

Set the debugLogging parameter to true to see internal logs:

[SCN.ClarityTracker] Clarity init started.
[SCN.ClarityTracker] Setting tag environment=PROD
[SCN.ClarityTracker] Sending event 'ButtonClicked' with token ...


This does not interfere with Clarity functionality.

🤝 Contribution

Pull requests are welcome!
If you find bugs or have feature ideas, open an Issue.

📄 License

MIT License.
Free to use in both commercial and personal solutions.
