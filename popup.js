// popup.js
document.addEventListener('DOMContentLoaded', () => {
  const generateBtn = document.getElementById('generateBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const resumeType = document.getElementById('resumeType');
  const statusDiv = document.getElementById('status');

  // Custom Select Logic
  const customSelect = document.querySelector('.custom-select');
  const customOptions = document.querySelectorAll('.custom-option');
  const customSelectText = document.getElementById('customSelectText');
  const arrow = document.querySelector('.arrow');

  if (customSelect && customSelectText) {
      // Toggle dropdown
      document.querySelector('.custom-select__trigger').addEventListener('click', function(e) {
        customSelect.classList.toggle('open');
        e.stopPropagation();
      });

      // Handle option selection
      customOptions.forEach(option => {
        option.addEventListener('click', function(e) {
          if (!this.classList.contains('selected')) {
            // Update selected class
            customOptions.forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            
            // Update text
            customSelectText.textContent = this.textContent;
            
            // Update hidden select
            const value = this.getAttribute('data-value');
            resumeType.value = value;
          }
          // Close dropdown
          customSelect.classList.remove('open');
          e.stopPropagation();
        });
      });

      // Close when clicking outside
      window.addEventListener('click', function(e) {
        if (!customSelect.contains(e.target)) {
          customSelect.classList.remove('open');
        }
      });
  }

  // Check if settings are configured
  chrome.storage.local.get(['geminiApiKey', 'userProfile'], (data) => {
    if (!data.geminiApiKey || !data.userProfile) {
      showStatus("Please configure your API Key and Profile in Settings first.", "error");
      generateBtn.disabled = true;
    }
  });

  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  generateBtn.addEventListener('click', async () => {
    // UI Reset
    showStatus("Capturing page and generating resume... This may take 10-20 seconds.", "loading");
    generateBtn.disabled = true;

    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Send message to Background to start the pipeline
    chrome.runtime.sendMessage({
      type: 'START_GENERATION',
      payload: {
        tabId: tab.id,
        resumeType: resumeType.value
      }
    }, (response) => {
      
      if (chrome.runtime.lastError) {
        showStatus("Error: " + chrome.runtime.lastError.message, "error");
        generateBtn.disabled = false;
        return;
      }

      if (response && response.status === 'success') {
        try {
          // Clean the response (Strip Markdown code blocks if present)
          let rawData = response.data.trim();
          if (rawData.startsWith('```json')) {
            rawData = rawData.replace(/^```json/, '').replace(/```$/, '');
          } else if (rawData.startsWith('```')) {
            rawData = rawData.replace(/^```/, '').replace(/```$/, '');
          }

          const resumeData = JSON.parse(rawData);
          generatePDF(resumeData, resumeType.value);
          showStatus("Resume downloaded successfully!", "success");
        } catch (e) {
          console.error("JSON Parse Error:", e);
          console.log("Raw Data:", response.data);
          showStatus("Error parsing generated resume. Please try again.", "error");
        }
      } else {
        showStatus("Error: " + (response ? response.message : "Unknown error"), "error");
      }
      generateBtn.disabled = false;
    });
  });

  function showStatus(text, type) {
    statusDiv.textContent = text;
    statusDiv.className = type; // loading, error, success
    statusDiv.style.display = 'block';
  }

  function generatePDF(data, type) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'pt', // Use points for finer control (1 pt = 1/72 inch)
      format: 'letter'
    });

    // --- Configuration ---
    const margin = 40; 
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - (margin * 2);
    const lineHeight = 1.4; // Increased from 1.2 to prevent overlap

    // State
    let y = 50; 

    // --- Helper Functions ---
    
    // Check if we need a new page
    function checkPageBreak(heightNeeded) {
      if (y + heightNeeded > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = 50; 
      }
    }

    // Measure text height (wrapping)
    function measureTextHeight(text, fontSize, maxWidth) {
      if (!text) return 0;
      doc.setFontSize(fontSize);
      // Clean text of characters that might mess up calculation or rendering
      const cleanText = text.replace(/[^\x00-\x7F]/g, (char) => {
         // Replace common curly quotes/dashes if any
         if (char === '’' || char === '‘') return "'";
         if (char === '“' || char === '”') return '"';
         if (char === '–' || char === '—') return '-';
         return ""; // Strip other non-ascii to be safe for standard fonts
      });
      const lines = doc.splitTextToSize(cleanText, maxWidth);
      return lines.length * fontSize * lineHeight;
    }

    // Add Text with options
    function addText(text, fontSize, fontStyle = 'normal', options = {}) {
      if (!text) return;

      const align = options.align || 'left';
      const color = options.color || '#000000';
      const maxWidth = options.maxWidth || contentWidth;
      const bottomSpacing = options.bottomSpacing || 0;

      doc.setFontSize(fontSize);
      doc.setFont("helvetica", fontStyle);
      doc.setTextColor(color);

      // Sanitization for Standard Fonts (Standard fonts don't support full Unicode)
      // We replace bullets and special chars to ensure they render or don't cause garbage.
      let cleanText = text.replace(/•/g, "").trim(); // Remove bullets if they are part of the string, we handle them separately in lists
      
      // Replace non-ASCII for safety in standard fonts
      cleanText = cleanText.replace(/[^\x00-\x7F]/g, (char) => {
         if (char === '’' || char === '‘') return "'";
         if (char === '“' || char === '”') return '"';
         if (char === '–' || char === '—') return '-';
         return " "; 
      });

      const lines = doc.splitTextToSize(cleanText, maxWidth);
      const height = lines.length * fontSize * lineHeight;

      checkPageBreak(height);

      if (align === 'center') {
        doc.text(lines, pageWidth / 2, y, { align: 'center' });
      } else if (align === 'right') {
        doc.text(lines, pageWidth - margin, y, { align: 'right' });
      } else {
        doc.text(lines, margin, y);
      }

      y += height + bottomSpacing;
    }

    // Add Section Header
    function addSectionHeader(title) {
      const fontSize = 12;
      checkPageBreak(30); 
      y += 10; 

      doc.setFontSize(fontSize);
      doc.setFont("helvetica", "bold");
      doc.setTextColor("#000000");
      doc.text(title.toUpperCase(), margin, y);
      
      y += 6; 
      doc.setLineWidth(1);
      doc.setDrawColor(0, 0, 0); 
      doc.line(margin, y, pageWidth - margin, y);
      
      y += 15; 
    }

    // Add Bullet Point
    function addBullet(text) {
      const fontSize = 11;
      const bulletIndent = 12;
      const maxWidth = contentWidth - bulletIndent;

      doc.setFontSize(fontSize);
      doc.setFont("helvetica", "normal");
      
      // Sanitize
      let cleanText = text.replace(/[^\x00-\x7F]/g, (char) => {
         if (char === '’' || char === '‘') return "'";
         if (char === '“' || char === '”') return '"';
         if (char === '–' || char === '—') return '-';
         return " "; 
      });

      const lines = doc.splitTextToSize(cleanText, maxWidth);
      const height = lines.length * fontSize * lineHeight;
      
      checkPageBreak(height);

      // Draw Bullet (Graphical Circle)
      // Centered vertically relative to the first line of text
      const bulletY = y - (fontSize / 3); 
      doc.setFillColor(0, 0, 0);
      doc.circle(margin + 3, bulletY, 2, 'F'); // 2pt radius circle
      
      // Draw text
      doc.text(lines, margin + bulletIndent, y);
      
      y += height + 4; // Spacing between bullets
    }

    // --- Rendering Logic ---

    // 1. Header (Name & Contact)
    // Name: Bold, 14
    addText(data.name, 14, 'bold', { align: 'center', bottomSpacing: 5 });
    
    // Contact: Normal, 11 (Joined by | if multiple)
    // Clean contact string if it's not already structured
    let contactInfo = data.contact;
    addText(contactInfo, 11, 'normal', { align: 'center', bottomSpacing: 15 });

    // 2. Summary
    if (data.summary) {
      addSectionHeader("Professional Summary");
      addText(data.summary, 11, 'normal', { bottomSpacing: 10 });
    }

    // 3. Skills (Inline)
    if (data.skills && data.skills.length > 0) {
      addSectionHeader("Skills");
      
      const fontSize = 11;
      doc.setFontSize(fontSize);
      doc.setFont("helvetica", "normal");
      
      const bulletRadius = 2;
      const bulletSpace = 12; // Space to reserve for bullet + spacing
      let currentX = margin;
      const h = fontSize * lineHeight;
      
      checkPageBreak(h);

      data.skills.forEach((skill, index) => {
        // Sanitize
        let text = skill.replace(/[^\x00-\x7F]/g, (char) => {
            if (char === '’' || char === '‘') return "'";
            if (char === '“' || char === '”') return '"';
            if (char === '–' || char === '—') return '-';
            return " "; 
        }).trim();
        
        if (!text) return;

        const textWidth = doc.getTextWidth(text);
        
        // Wrap if text doesn't fit
        if (currentX + textWidth > pageWidth - margin) {
          currentX = margin;
          y += h;
          checkPageBreak(h);
        }
        
        doc.text(text, currentX, y);
        currentX += textWidth;
        
        // Draw bullet if not last
        if (index < data.skills.length - 1) {
           // Check if bullet fits
           if (currentX + bulletSpace > pageWidth - margin) {
             currentX = margin;
             y += h;
             checkPageBreak(h);
           } else {
             // Draw bullet
             const gap = 8;
             currentX += gap; // gap before bullet
             const bulletY = y - (fontSize / 3);
             doc.setFillColor(0, 0, 0);
             doc.circle(currentX, bulletY, bulletRadius, 'F');
             currentX += gap; // gap after bullet
           }
        }
      });
      
      y += h + 10; // Bottom spacing
    }

    // 4. Experience
    if (data.experience && data.experience.length > 0) {
      addSectionHeader("Experience");

      data.experience.forEach(exp => {
        // Need space for the job header row at least
        checkPageBreak(50);

        // Row 1: Title (Left) + Period (Right)
        // Calculate widths to prevent overlap
        doc.setFontSize(11);
        doc.setFont("helvetica", "normal"); // Measure date with normal font
        const periodText = (exp.period && exp.period !== 'N/A' && exp.period !== 'n/a') ? exp.period : "";
        const dateWidth = doc.getTextWidth(periodText);
        
        // Title setup
        const titleText = exp.title.toUpperCase();
        doc.setFont("helvetica", "bold");
        
        // Available width for title = Content Width - Date Width - Spacer (e.g. 20pt)
        const availableTitleWidth = contentWidth - dateWidth - 20;
        
        // Sanitize and split title
        let cleanTitle = titleText.replace(/[^\x00-\x7F]/g, (char) => {
           if (char === '’' || char === '‘') return "'";
           if (char === '“' || char === '”') return '"';
           if (char === '–' || char === '—') return '-';
           return " "; 
        });
        const titleLines = doc.splitTextToSize(cleanTitle, availableTitleWidth);
        
        // Render Date (Right aligned at the same Y as the first line of title)
        doc.setFont("helvetica", "normal");
        doc.text(periodText, pageWidth - margin, y, { align: 'right' });
        
        // Render Title (Left aligned)
        doc.setFont("helvetica", "bold");
        doc.text(titleLines, margin, y);
        
        // Adjust Y based on title height
        const titleHeight = titleLines.length * 11 * lineHeight;
        y += Math.max(titleHeight, 14); // Ensure we move down at least one line

        // Row 2: Company (Left) + Location (Right optional)
        doc.setFontSize(11);
        doc.setFont("helvetica", "italic"); 
        
        if (exp.location && exp.location !== 'N/A' && exp.location !== 'n/a') {
             const locWidth = doc.getTextWidth(exp.location);
             doc.setFont("helvetica", "normal");
             doc.text(exp.location, pageWidth - margin, y, { align: 'right' });
             
             // Wrap company if needed
             const availableCompWidth = contentWidth - locWidth - 20;
             const companyLines = doc.splitTextToSize(exp.company, availableCompWidth);
             doc.setFont("helvetica", "italic"); 
             doc.text(companyLines, margin, y);
             
             y += Math.max(companyLines.length * 11 * lineHeight, 14);
        } else {
             // No location, full width for company
             doc.text(exp.company, margin, y);
             y += 14;
        }
        
        y += 4; // Space after job header before bullets

        // Bullets
        if (exp.points && Array.isArray(exp.points)) {
          exp.points.forEach(point => addBullet(point));
        }
        y += 6; // Space between jobs (4 from bullet + 6 = 10)
      });
    }

    // 5. Projects (Optional)
    // Hide projects for Basic resume type as requested
    if (type !== 'basic' && data.projects && data.projects.length > 0) {
      addSectionHeader("Projects");
      data.projects.forEach(proj => {
        checkPageBreak(30);
        
        // Name (Bold)
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(proj.name, margin, y);
        y += 14;

        // Description
        addText(proj.description, 11, 'normal', { bottomSpacing: 10 });
      });
    }

    // 6. Education
    if (data.education && data.education.length > 0) {
      addSectionHeader("Education");
      
      data.education.forEach(edu => {
        checkPageBreak(40);
        
        // School (Bold) + Year (Right)
        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
        let yearText = (edu.year && edu.year !== 'N/A' && edu.year !== 'n/a') ? edu.year : "";
        const yearWidth = doc.getTextWidth(yearText);
        
        // School Wrap
        const availableSchoolWidth = contentWidth - yearWidth - 20;
        doc.setFont("helvetica", "bold");
        const schoolLines = doc.splitTextToSize(edu.school, availableSchoolWidth);
        
        // Render Year
        doc.setFont("helvetica", "normal");
        if (yearText) doc.text(yearText, pageWidth - margin, y, { align: 'right' });
        
        // Render School
        doc.setFont("helvetica", "bold");
        doc.text(schoolLines, margin, y);
        
        y += Math.max(schoolLines.length * 11 * lineHeight, 14);

        // Degree
        doc.setFont("helvetica", "normal");
        const degreeLines = doc.splitTextToSize(edu.degree, contentWidth);
        doc.text(degreeLines, margin, y);
        
        y += (degreeLines.length * 11 * lineHeight) + 10;
      });
    }

    // 7. Certifications
    if (data.certifications && data.certifications.length > 0) {
      addSectionHeader("Certifications");
      data.certifications.forEach(cert => {
         checkPageBreak(20);
         let text = cert.name || "";
         
         const issuer = (cert.issuer && !/^(n\/a|none|unknown|ongoing)$/i.test(cert.issuer)) ? cert.issuer : "";
         const year = (cert.year && !/^(n\/a|none|unknown|ongoing|present)$/i.test(cert.year)) ? cert.year : "";

         if (issuer) text += ` - ${issuer}`;
         if (year) text += ` (${year})`;
         
         addBullet(text);
      });
      y += 6; // Extra spacing after list to match other sections (4 from bullet + 6 = 10)
    }

    // Save
    const filename = `Resume_${(data.name || 'Generated').replace(/\s+/g, '_')}.pdf`;
    doc.save(filename);
  }
});
