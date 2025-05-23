
  
  // Wait until the DOM is fully loaded
  document.addEventListener('DOMContentLoaded', () => {
    const submitBtn  = document.getElementById('submit-btn');
    const resultsBox = document.getElementById('results-container');
    const resultText  = document.getElementById('result-text');
  
    const getRadio = n =>
      (document.querySelector(`input[name="${n}"]:checked`) || {}).value || null;
  
    const getChecks = n =>
      Array.from(document.querySelectorAll(`input[name="${n}"]:checked`))
           .map(el => el.value);

    // Initial state: hide results box
    resultsBox.style.display = 'none';
  
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

          if (matchedCharity) {
            // *** HIGHLIGHTED CHANGE START ***
            // 3. Search the backendCharities (which replaces your old charityList) for a match
            //    Access 'charity.charity' because that's the key name in your JSON objects.
            charityDetails = backendCharities.find(charity => charity.charity && charity.charity.toLowerCase() === matchedCharity.toLowerCase());
            // *** HIGHLIGHTED CHANGE END ***
          }

          console.log("Matched Charity Name:", matchedCharity);
          console.log("Found Charity Details:", charityDetails);

          if (charityDetails) {
            description = charityDetails.description;
            finalDonationLink = charityDetails.link; // Backend's link is preferred
            resultText.innerHTML = `
              <strong>${charityDetails.charity}</strong><br />
              <p>${charityDetails.description}</p>
              <a href="${finalDonationLink}" target="_blank">Donate to ${charityDetails.charity}</a>
            `;
          } else if (matchedCharity) {
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
                  charity => charity.name.toLowerCase() !== charityDetails.charity.toLowerCase()
              );
          }
  
          // Display the static charity list under the result
          const staticCharityListHTML = charitiesToDisplayAsOthers.map(charity => `
            <div class="charity-result">
              <strong>${charity.charity}</strong><br />
              <p>${charity.description}</p>
              <a href="${charity.donationLink}" target="_blank">Donate to ${charity.charity}</a>
            </div>
          `).join('');
  
          // Append the static charity list below the result
          resultText.innerHTML += `
            <h3>Other Charities You Can Support:</h3>
            ${staticCharityListHTML}
          `;
  
          resultsBox.style.display = 'block'; // Ensure the results box is visible
          }
        })
        .catch(err => {
          console.error(err);
          resultText.innerHTML = '⚠️ Error calling backend.';
          resultsBox.style.display = 'block';
        });
    });
  });