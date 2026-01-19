# User Journeys & Narratives

This directory contains narrative-driven user journeys designed to ground our product development, marketing, and testing in realistic user experiences.

Instead of abstract "User Stories" (e.g., "As a user, I want to..."), these are **User Narratives**. They describe the emotional arc, the friction points, the "Aha!" moments, and the specific context of use.

## The Personas

| File | Persona | Key Motivation | Key Friction | "Aha!" Moment |
|------|---------|----------------|--------------|---------------|
| `01` | **The Privacy Advocate** | Data Sovereignty | Verifying local execution (Network tab) | Seeing the analysis without outbound requests. |
| `02` | **The Music Nerd** | Validation & Depth | Obtaining the API Key | "Why I stopped listening to [Band]" (Contextual insight). |
| `03` | **The Stats.fm Refugee** | Cost (Free vs Paid) | "Bring Your Own Key" setup | Getting "Premium" insights for $0. |
| `04` | **The Non-Technical User** | Social/Viral Trends | The "Scary" Developer Console | The AI calling out a "Guilty Pleasure" accurately. |

## How to Use These

1.  **Marketing & Copywriting:**
    *   Use the "Climax" dialogue in landing page headers.
    *   Use the "Friction" descriptions to write better onboarding guides (e.g., anticipating the "Enable API" confusion).
    *   Use the "Verdict" sections for testimonials.

2.  **Product Development:**
    *   **Test against these scripts.** Does the app actually handle the "Vague Question" failure mode as gracefully as described in Journey 04?
    *   **Prioritize features.** If the Privacy Advocate checks the Network tab, we must ensure *zero* stray requests during parsing.

3.  **Community Engagement:**
    *   Paste the relevant narrative into Reddit comments/HN threads when introducing the tool to those specific subcultures.
