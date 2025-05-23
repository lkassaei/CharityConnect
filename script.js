

  
  // Wait until the DOM is fully loaded
  document.addEventListener('DOMContentLoaded', () => {
    const submitBtn  = document.getElementById('submit-btn');
    const resultsBox = document.getElementById('results-container');
    const resultText  = document.getElementById('result-text');
    const otherCharitiesListBox = document.getElementById('other-charities-list-box'); // The new box for other charities
  
    const getRadio = n =>
      (document.querySelector(`input[name="${n}"]:checked`) || {}).value || null;
  
    const getChecks = n =>
      Array.from(document.querySelectorAll(`input[name="${n}"]:checked`))
           .map(el => el.value);

    resultsBox.style.display = 'none';
    otherCharitiesListBox.style.display = 'none';
  
    submitBtn.addEventListener('click', () => {
      const answers = {
        cause:   getRadio('cause'),
        groups:  getChecks('groups'),
        region:  getRadio('region'),
        faith:   getRadio('faith'),
        support: getRadio('support')
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
          let otherCharitiesContent = '';
  
          // Check if the response has the expected structure
          if (data && data.choices && data.choices.length > 0) {
            const aiResult = data.choices[0].message.content;
            console.log("AI Result:", aiResult); // Log the raw result from the AI
    
            let matchedCharity = null;
            let description = null;
            let donationLink = null;
            let charityDetails = null; // This variable will now hold the charity object found from backend data
            let finalDonationLink = null; // To hold the final link for HTML
    
            // 1. Extract Charity Name (look for the first bold text)
            const charityMatch = aiResult.match(/^(\*\*)(.*?)(\*\*)/m);
            if (charityMatch && charityMatch[2]) {
              matchedCharity = charityMatch[2].trim();
            }

            // 2. Extract Donation Link from AI (as a fallback)
            const linkMatch = aiResult.match(/\*\*\s*Link:\*\*\s*\[.*?\]\((https?:\/\/[^\)]+)\)/i);
            if (linkMatch && linkMatch[1]) {
              donationLink = linkMatch[1];
            } else {
              const linkUrlMatch = aiResult.match(/\*\*\s*Link:\*\*\s*(https?:\/\/[^\s]+)/i);
              if (linkUrlMatch && linkUrlMatch[1]) {
                donationLink = linkUrlMatch[1];
              }
            }
            console.log("AI Extracted Link:", donationLink);
            
            console.log("DEBUG: matchedCharity from AI:", matchedCharity);
            console.log("DEBUG: backendCharities content (first 2 items):", backendCharities.slice(0, 2));
            if (backendCharities.length > 0) {
                console.log("DEBUG: Example backendCharities[0].name:", backendCharities[0].name);
            }

            if (matchedCharity) {
              // Add a normalizeString helper here for robust comparison
              const normalizeString = (str) => {
                  if (!str) return ''; // Handle null/undefined strings
                  // Remove all non-alphanumeric characters (keep letters and numbers)
                  // and convert to lowercase for robust matching.
                  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
              };

              const normalizedMatchedCharity = normalizeString(matchedCharity);
              console.log("DEBUG: Normalized AI Matched Charity:", normalizedMatchedCharity, `(Length: ${normalizedMatchedCharity.length})`);

              // 3. Search the backendCharities (which replaces your old charityList) for a match
              //    Access 'charity.charity' because that's the key name in your JSON objects.
              charityDetails = backendCharities.find(charity => {
                  if (charity.name) {
                      const normalizedBackendCharityName = normalizeString(charity.name);
                      // *** NEW DEBUGGING LOGS ***
                      console.log(`DEBUG: Comparing Normalized: "${normalizedMatchedCharity}" (AI) vs "${normalizedBackendCharityName}" (Backend)`, `(Lengths: ${normalizedMatchedCharity.length} vs ${normalizedBackendCharityName.length})`);
                      // *** END NEW DEBUGGING LOGS ***

                      return normalizedBackendCharityName === normalizedMatchedCharity;
                  }
                  return false;
              });
            }

            console.log("Matched Charity Name:", matchedCharity);
            console.log("Found Charity Details Object:", charityDetails);

            if (charityDetails) {
              description = charityDetails.description;
              finalDonationLink = charityDetails.link; // Backend's link is preferred
              resultText.innerHTML = `
                <strong>${charityDetails.name}</strong><br />
                <p>${charityDetails.description}</p>
                <a href="${finalDonationLink}" target="_blank">Donate to ${charityDetails.name}</a>
              `;
            } else if (matchedCharity) {
              let aiExtractedDescription = null;
              const aiDescMatch = aiResult.match(/\*\*\s*Description:\*\*\s*([\s\S]*?)(?=\*\*Link:|\*\*Impact:|\n{2,}|$)/i);
              if (aiDescMatch && aiDescMatch[1]) {
                  aiExtractedDescription = aiDescMatch[1].trim();
              }
              
              resultText.innerHTML = `
                <strong>${matchedCharity}</strong><br />
                <p>Description not found in our local data.</p>
                <a href="${donationLink || '#'}" target="_blank">Donate to ${matchedCharity} (Link from AI)</a>
              `;
              console.warn(`Charity "${matchedCharity}" found in AI but not fully in static list. Using AI link.`);
              finalDonationLink = donationLink || '#';
            } else {
              console.error("Error: Could not extract charity name from AI response.");
              resultText.innerHTML = '⚠️ Unable to identify the charity from the AI response.';
            }

            let charitiesToDisplayAsOthers = backendCharities;
            if (charityDetails) { // If a specific charity was found and displayed as the top match
                charitiesToDisplayAsOthers = backendCharities.filter(
                    charity => charity.name && charity.name.toLowerCase() !== charityDetails.name.toLowerCase()
                );
            }
    
            // Display the static charity list under the result
            const staticCharityListHTML = charitiesToDisplayAsOthers.map(charity => `
              <div class="charity-result">
                <strong>${charity.name}</strong><br />
                <p>${charity.description}</p>
                <a href="${charity.link}" target="_blank">Donate to ${charity.name}</a>
              </div>
            `).join('');

            // Append the static charity list below the result
            otherCharitiesContent += `
              <h3>Other Charities You Can Support:</h3>
              ${staticCharityListHTML}
            `;
            
            resultsBox.style.display = 'block'; // Ensure the results box is visible
            otherCharitiesListBox.innerHTML = otherCharitiesContent;
            otherCharitiesListBox.style.display = 'block';
          }
        })
        .catch(err => {
          console.error(err);
          resultText.innerHTML = '⚠️ Error calling backend.';
          resultsBox.style.display = 'block';
        });
    });
  });
