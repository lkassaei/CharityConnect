// Wait until the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const submitBtn  = document.getElementById('submit-btn');
    const resultsBox = document.getElementById('results-container');
    const resultText  = document.getElementById('result-text');
    const otherCharitiesListBox = document.getElementById('other-charities-list-box'); // The new box for other charities

    resultsBox.style.display = 'none';
    otherCharitiesListBox.style.display = 'none';

    // getRadio is not used if all questions are checkboxes, can remove if confirmed
    const getRadio = n =>
      (document.querySelector(`input[name="${n}"]:checked`) || {}).value || null;

    const getChecks = n =>
      Array.from(document.querySelectorAll(`input[name="${n}"]:checked`))
           .map(el => el.value);

    submitBtn.addEventListener('click', () => {
      const answers = {
        cause:   getChecks('cause'),
        groups:  getChecks('groups'),
        region:  getChecks('region'),
        faith:   getChecks('faith'),
        support: getChecks('support')
      };

      // Show results container
      resultsBox.style.display = 'block';
      resultText.innerHTML = '<p>Loading recommendations...</p>'; // Display loading in your resultText area
      otherCharitiesListBox.style.display = 'none';

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
          console.log("API Response:", data); // Log the full API response for debugging

          const backendCharities = data.other_charities || [];

          // Check if the response has the expected structure
          if (data && data.choices && data.choices.length > 0) {
            const aiResult = data.choices[0].message.content;
            console.log("AI Result:", aiResult); // Log the raw result from the AI

            let matchedCharity = null;
            let donationLink = null;
            let charityDetails = null;
            let finalDonationLink = null;

            // 1. Extract Charity Name (UPDATED REGEX for **Charity Name (XYZ)** format after newline)
            // This regex captures the bolded text that appears before **Description:
            const charityNameMatch = aiResult.match(/\n\s*\*\*(.*?)\*\*\n\s*\*\*Description:/i);
            if (charityNameMatch && charityNameMatch[1]) {
              matchedCharity = charityNameMatch[1].trim();
            }

            // 2. Extract Donation Link (UPDATED REGEX for **Link:** URL format)
            const linkMatch = aiResult.match(/\*\*Link:\*\* (https?:\/\/[^\s]+)/i);
            if (linkMatch && linkMatch[1]) {
              donationLink = linkMatch[1];
            }

            console.log("AI Extracted Link:", donationLink);
            console.log("DEBUG: matchedCharity from AI:", matchedCharity);
            console.log("DEBUG: backendCharities content (first 2 items):", backendCharities.slice(0, 2));
            if (backendCharities.length > 0) {
                console.log("DEBUG: Example backendCharities[0].name:", backendCharities[0].name);
            }

            if (matchedCharity) {
              const normalizeString = (str) => {
                  if (!str) return '';
                  // Remove text in parentheses (like WFP), then non-alphanumeric, then lowercase
                  return str.replace(/\([^)]*\)/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
              };

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

            let topMatchContent = ''; // Variable to hold the HTML for the top match
            if (charityDetails) {
              finalDonationLink = charityDetails.link; // Backend's link is preferred
              topMatchContent = `
                <div class="charity-result recommended-charity">
                  <strong>${charityDetails.name}</strong><br />
                  <p>${charityDetails.description}</p>
                  <a href="${finalDonationLink}" target="_blank">Donate to ${charityDetails.name}</a>
                </div>
              `;
            } else if (matchedCharity) {
              let aiExtractedDescription = null;
              // This regex for description should still be fine
              const aiDescMatch = aiResult.match(/\*\*Description:\*\*([\s\S]*?)(?=\*\*Link:|\*\*Impact:|\n{2,}|$)/i);
              if (aiDescMatch && aiDescMatch[1]) {
                  aiExtractedDescription = aiDescMatch[1].trim();
              }

              topMatchContent = `
                <div class="charity-result recommended-charity">
                  <strong>${matchedCharity}</strong><br />
                  <p>${aiExtractedDescription || "Description not found in our local data."}</p>
                  <a href="${donationLink || '#'}" target="_blank">Donate to ${matchedCharity} (Link from AI)</a>
                </div>
              `;
              console.warn(`Charity "${matchedCharity}" found in AI but not fully in static list. Using AI link.`);
            } else {
              console.error("Error: Could not extract charity name from AI response.");
              topMatchContent = '⚠️ Unable to identify the charity from the AI response.';
            }

            resultText.innerHTML = topMatchContent; // Put the top match content into resultText

            let charitiesToDisplayAsOthers = backendCharities;
            if (charityDetails) { // If a specific charity was found and displayed as the top match
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

            resultsBox.style.display = 'block';
            otherCharitiesListBox.innerHTML = otherCharitiesContent;
            otherCharitiesListBox.style.display = 'block';
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