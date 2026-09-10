# Civicpulse
CivicPulse began as an AI-powered civic complaint platform: a system that could detect duplicate reports, categorize issues automatically, and give officials a clearer picture of citizen complaints than a traditional grievance portal. This document extends that foundation into a full layered intelligence architecture.



TO RUN FRONT END:

# Citizen portal — http://localhost:5173
cd Civicpulse/frontend/citizen-portal
npm install
cp .env.example .env
npm run dev

# Officer dashboard — http://localhost:5174 (separate terminal)
cd Civicpulse/frontend/officer-dashboard
npm install
cp .env.example .env
npm run dev