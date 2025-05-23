// Wait until the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const submitBtn = document.getElementById('submit-btn');
    const resultsBox = document.getElementById('results-container');
    const resultText = document.getElementById('result-text');
    const otherCharitiesListBox = document.getElementById('other-charities-list-box'); // Assuming you want this box to exist

    // Initial state: hide results box and other charities box
    resultsBox.style.display = 'none';
    otherCharitiesListBox.style.display = 'none'; // Ensure this is hidden initially

    const getRadio = n =>
        (document.querySelector(`input[name="${n}"]:checked`) || {}).value || null;

    const getChecks = n =>
        Array.from(document.querySelectorAll(`input[name="${n}"]:checked`))
            .map(el => el.value);

    // ***************************************************************
    // IMPORTANT: Move normalizeString function here to be accessible globally
    // ***************************************************************
    const normalizeString = (str) => {
        if (!str) return '';
        // Remove text in parentheses (like WFP), then all non-alphanumeric, then lowercase
        return str.replace(/\([^)]*\)/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    };
    // ***************************************************************

    submitBtn.addEventListener('click', () => {
        const answers = {
            cause: getChecks('cause'),
            groups: getChecks('groups'),
            region: getChecks('region'),
            faith: getChecks('faith'),
            support: getChecks('support')
        };

        // Show results container and loading message
        resultsBox.style.display = 'block';
        resultText.innerHTML = '<p>Loading recommendations...</p>';
        otherCharitiesListBox.style.display = 'none'; // Hide other charities box during loading

        // Send answers to the backend API
        fetch('/api/charity-match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers })
        })
        .then(r => {
            if (!r.ok) throw new Error(r.statusText);
            return r.json();
        })
        .then(data => {
            console.log("API Response:", data);

            const backendCharities = data.other_charities || [];

            if (data && data.choices && data.choices.length > 0) {
                const aiResult = data.choices[0].message.content;
                console.log("AI Result (RAW string):", aiResult);
                console.log("AI Result Length:", aiResult.length);
                console.log("AI Result (first 100 chars):", aiResult.substring(0, 100));
                console.log("AI Result (last 100 chars):", aiResult.substring(aiResult.length - 100));
                console.log("AI Result (JSON stringified to reveal hidden chars):", JSON.stringify(aiResult));

                let matchedCharity = null;
                let description = null;
                let donationLink = null;
                let charityDetails = null;
                let finalDonationLink = null;

                // 1. Extract Charity Name: Look for "**Charity Name:** " and capture the text until a newline.
                const charityNameMatch = aiResult.match(/\*\*Charity Name:\*\* (.+?)(?:[\r\n]|$)/i);
                if (charityNameMatch && charityNameMatch[1]) {
                    matchedCharity = charityNameMatch[1].trim();
                }

                // 2. Extract Description: Look for "**Description:** " and capture content until next section.
                const aiDescMatch = aiResult.match(/\*\*Description:\*\*([\s\S]+?)(?=[\r\n]\*\*Link:|\n{2,}|\s*$)/i);
                if (aiDescMatch && aiDescMatch[1]) {
                    description = aiDescMatch[1].trim();
                }

                // 3. Extract Donation Link: Look for "**Link:** " and capture the URL.
                // This covers the simple URL format.
                const linkUrlMatch = aiResult.match(/\*\*Link:\*\* (https?:\/\/[^\s]+)/i);
                if (linkUrlMatch && linkUrlMatch[1]) {
                    donationLink = linkUrlMatch[1];
                }

                console.log("AI Extracted Link:", donationLink);
                console.log("DEBUG: matchedCharity from AI:", matchedCharity);
                console.log("DEBUG: extractedDescription from AI:", description); // Log extracted description
                console.log("DEBUG: backendCharities content (first 2 items):", backendCharities.slice(0, 2));
                if (backendCharities.length > 0) {
                    console.log("DEBUG: Example backendCharities[0].name:", backendCharities[0].name);
                }

                if (matchedCharity) {
                    // normalizeString is now defined outside this block
                    const normalizedMatchedCharity = normalizeString(matchedCharity);
                    console.log("DEBUG: Normalized AI Matched Charity:", normalizedMatchedCharity, `(Length: ${normalizedMatchedCharity.length})`);

                    charityDetails = backendCharities.find(charity => {
                        if (charity.name) {
                            const normalizedBackendCharityName = normalizeString(charity.name);
                            console.log(`DEBUG: Comparing Normalized: "${normalizedMatchedCharity}" (AI) vs "${normalizedBackendCharityName}" (Backend)`, `(Lengths: ${normalizedMatchedCharity.length} vs ${normalizedBackendCharityName.length})`);
                            return normalizedBackendCharityName === normalizedMatchedCharity;
                        }
                        return false;
                    });
                }

                console.log("Matched Charity Name:", matchedCharity);
                console.log("Found Charity Details Object:", charityDetails);

                let topMatchContent = '';
                if (charityDetails) {
                    // Prefer backend data if found
                    finalDonationLink = charityDetails.link;
                    topMatchContent = `
                        <div class="charity-result recommended-charity">
                            <strong>${charityDetails.name}</strong><br />
                            <p>${charityDetails.description}</p>
                            <a href="${finalDonationLink}" target="_blank">Donate to ${charityDetails.name}</a>
                        </div>
                    `;
                } else if (matchedCharity) {
                    // Use AI extracted data if no backend match, but a name was found
                    topMatchContent = `
                        <div class="charity-result recommended-charity">
                            <strong>${matchedCharity}</strong><br />
                            <p>${description || "Description not found in our local data."}</p>
                            <a href="${donationLink || '#'}" target="_blank">Donate to ${matchedCharity} (Link from AI)</a>
                        </div>
                    `;
                    console.warn(`Charity "${matchedCharity}" found in AI but not fully in static list. Using AI link.`);
                    finalDonationLink = donationLink || '#';
                } else {
                    console.error("Error: Could not extract charity name from AI response.");
                    topMatchContent = '⚠️ Unable to identify the charity from the AI response.';
                }

                resultText.innerHTML = topMatchContent; // Put the top match content into resultText

                let charitiesToDisplayAsOthers = backendCharities;
                if (charityDetails) {
                    // Filter out the top matched charity from the "other charities" list
                    // normalizeString is now accessible here
                    charitiesToDisplayAsOthers = backendCharities.filter(
                        charity => charity.name && normalizeString(charity.name) !== normalizeString(charityDetails.name)
                    );
                }

                const staticCharityListHTML = charitiesToDisplayAsOthers.map(charity => `
                    <div class="charity-result">
                        <strong>${charity.name}</strong><br />
                        <p>${charity.description}</p>
                        <a href="${charity.link}" target="_blank">Donate to ${charity.name}</a>
                    </div>
                `).join('');

                let otherCharitiesContent = `
                    <h3>Other Charities You Can Support:</h3>
                    ${staticCharityListHTML}
                `;

                otherCharitiesListBox.innerHTML = otherCharitiesContent;
                otherCharitiesListBox.style.display = 'block'; // Show the other charities box

                resultsBox.style.display = 'block'; // Ensure the main results box is visible
            } else {
                console.error("Error: Backend response did not contain expected AI choices structure.", data);
                resultText.innerHTML = '⚠️ An unexpected response format was received from the AI. Please try again.';
                resultsBox.style.display = 'block';
                otherCharitiesListBox.style.display = 'none';
            }
        })
        .catch(err => {
            console.error("Error calling backend:", err);
            resultText.innerHTML = '⚠️ Error calling backend: ' + err.message;
            resultsBox.style.display = 'block';
            otherCharitiesListBox.style.display = 'none';
        });
    });
});