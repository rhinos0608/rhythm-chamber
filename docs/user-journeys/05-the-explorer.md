# User Journey: The Explorer

**Source Channel:** Social media (Twitter/X, Instagram, TikTok), word-of-mouth
**Motivations:** Curiosity, "what if", experimentation, privacy exploration
**Friction Tolerance:** Medium (willing to try but quick to abandon if confusing)

---

## The Narrative

"I don't have my Spotify data handy, and honestly, I'm not sure I want to upload it anyway. But I'm curious what this thing actually does..."

### 1. The Discovery

"Scrolling through Twitter, I see a post about an AI that analyzes your Spotify personality. There's a screenshot showing someone identified as 'The Emotional Archaeologist' with a surprisingly accurate description.

I click through to the site. The landing page shows three options: Upload Your Data, Quick Snapshot, Try Demo Mode.

But then I notice a fourth option: **✨ Create a Custom Profile**.

'What's this?' I wonder. A way to try it without my actual data?"

**Design Notes:**
- The fourth CTA stands out visually with gradient background and sparkle icon
- Placement in the CTA group makes it feel like a first-class option
- Label "Create a Custom Profile" is clear and intriguing

### 2. The Creative Prompt

"I click the button and a clean modal pops up. It asks me to describe my ideal listening profile.

The instructions say: *Describe your ideal listening profile in natural language. We'll generate a synthetic music history and personality to match.*

There are example suggestions:
- 🌙 Night owl who loves electronic music
- 🚗 Classic rock road trip enthusiast
- 🎷 Jazz lover who used to listen to pop

I decide to get creative. I type: *'Someone who used to be really into emo and post-hardcore in high school, but discovered jazz in college and now mostly listens to piano jazz and bebop. Still has a soft spot for Taking Back Sunday though.'*

**Design Notes:**
- Modal appears immediately with backdrop blur
- Examples provide clear guidance without being prescriptive
- Textarea is focused automatically for immediate input
- Generate button is disabled until input is sufficient (10+ characters)

### 3. Watching the Magic

"I click 'Generate Profile' and watch the progress bar fill:

*Analyzing description...* → 10%
*Combining patterns...* → 30%
*Generating listening history...* → 50%
*Detecting personality...* → 70%
*Finalizing profile...* → 90%

Within seconds, a profile card appears:

**The Jazz Convert** 🎷
*Your Type: Emotional Archaeologist*
*'Someone who used to be really into emo and post-hardcore...'*

**1,847** Synthetic Streams | **2** Templates Used
Built from: *The Emo Teen • The Late Bloomer*

'No way,' I think. 'It actually understood what I meant.'"

**Design Notes:**
- Progress updates create anticipation and trust
- Personality type is clearly displayed with readable formatting
- Stats give concrete sense of what was generated
- Template badges show the "how" behind the synthesis

### 4. The Interaction

"I click **Start Chatting** and the app loads. I'm now chatting with this synthetic persona.

I ask: *'What was my musical evolution like?'*

The AI responds: *'You underwent a dramatic transformation between 2018-2020. Your high school years were dominated by emo and post-hardcore — My Chemical Romance, Fall Out Boy, Taking Back Sunday. Then around 2019, there's a noticeable shift. The anger gives way to melancholy. You discover Bill Evans, then Keith Jarrett. By 2021, you're firmly in bebop territory — Coltrane, Monk, Davis. The emo guitar solos became piano solos.'*

I stare at the screen. It created an entire fake history that matches the emotional arc I described. It's not my real data, but it FEELS true."

**Design Notes:**
- Navigation is seamless (no page reload feeling)
- Initial message explains this is a synthetic profile
- Chat responses are contextual and detailed
- The distinction between "real" and "synthetic" is maintained

### 5. The Verdict

"Okay, now I get what this app does. The synthetic profile showed me the kind of insights it can provide without needing my actual data.

I'm impressed. The AI didn't just match keywords — it understood the *emotional trajectory* of music taste. It recognized that 'emo to jazz' is a specific pattern of maturation.

I might actually upload my real data now. If it can do this with a fake profile, imagine what it would find in my actual 12-year listening history."

*Two days later, I uploaded my Spotify JSON. Turns out I really am an Emotional Archaeologist. The app was right about me twice — once with a fake me, once with the real one.*

**Design Notes:**
- The feature serves as a "demo" that shows value without privacy cost
- Users can explore multiple synthetic profiles to understand the app
- Acts as a funnel: custom profile → real data upload

---

## Key Moments

| Moment | User Thought | Design Implication |
|--------|-------------|-------------------|
| Seeing the fourth CTA | "What's this?" | Button should stand out visually (gradient color, sparkle icon) |
| Reading the prompt | "What do I type?" | Clear examples are crucial for orientation |
| Watching progress | "Is it working?" | Progress updates create anticipation and trust |
| Seeing the result | "It understood!" | Profile card must show clear connection to input |
| First chat message | "Let me test this" | Initial message should explain this is synthetic |
| Sharing the discovery | "Check this out" | The profile card is shareable (future feature) |

## Friction Points & Solutions

| Friction | Solution |
|----------|----------|
| "What kind of description works?" | Three varied example chips covering different personas |
| "Is this actually working?" | Animated progress bar with descriptive status messages |
| "This is just a demo, right?" | Clear labeling of synthetic nature + explanation of what that means |
| "Can I save this?" | Profile is automatically saved for future sessions |
| "What if I don't like it?" | Easy "Try Again" button in error state |

## Success Metrics

- **Completion Rate**: % of users who finish profile creation after opening modal
- **Time to Chat**: Average time from landing page to active chat session
- **Return Rate**: % of users who later return with real data
- **Profile Variety**: Number of distinct personality types generated
- **Share Rate**: % of users who share their synthetic profile (if sharing is added)

## Technical Implementation

### Entry Point

The custom profile feature is accessed via the fourth CTA button on the landing page:

```html
<a href="#" class="btn btn-accent" id="custom-profile-btn"
   data-action="show-custom-profile-modal">
  <span>✨</span> Create a Custom Profile
</a>
```

### Modal States

The modal has four distinct states:

1. **Input State**: Initial state with textarea and example chips
2. **Progress State**: Shows animated progress bar during synthesis
3. **Success State**: Displays profile summary card and "Start Chatting" button
4. **Error State**: Shows error message and "Try Again" button

### Synthesis Flow

```
User Input → ProfileSynthesizer.synthesizeFromDescription()
           → Selects matching templates via keyword/AI
           → Combines patterns from templates
           → Generates synthetic streams
           → Runs personality detection
           → Returns complete profile object
```

### Data Persistence

- Profile is saved to IndexedDB via `ProfileStorage.saveProfile()`
- Profile ID stored in `sessionStorage` for app.html pickup
- Profile marked with `isSynthetic: true` in metadata

### Chat Initialization

```javascript
// In app.js, mode=custom handler
const profile = await ProfileStorage.getProfile(pendingProfileId);
await Chat.initChat(
    profile.personality,
    profile.patterns,
    summary,
    profile.streams
);
```

## Accessibility Considerations

- **Focus Management**: Focus trap keeps keyboard navigation within modal
- **ARIA Attributes**: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
- **Keyboard Shortcuts**: Ctrl/Cmd+Enter to submit, Escape to close
- **Screen Reader**: Proper labeling of textarea and buttons
- **Color Contrast**: All text meets WCAG AA standards

## Future Enhancements

1. **Profile Sharing**: Allow users to share their synthetic profile cards
2. **Profile Gallery**: Browse community-created synthetic profiles
3. **Refinement Tools**: Adjust profile after generation (tweak parameters)
4. **Comparison Mode**: Compare multiple synthetic profiles side-by-side
5. **Export**: Download synthetic profile as JSON (for testing/development)

---

## Related Documentation

- [User Journey: The Archivist](./01-the-archivist.md) - Full data upload flow
- [User Journey: The Sprinter](./02-the-sprinter.md) - Quick Snapshot flow
- [Profile Synthesis](../technical/profile-synthesis.md) - Technical implementation details
- [Template Profiles](../technical/template-profiles.md) - Available profile templates
