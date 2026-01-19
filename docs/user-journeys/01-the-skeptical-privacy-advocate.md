# User Journey: The Skeptical Privacy Advocate

**Source Channel:** Hacker News / r/privacy / Mastodon
**Motivations:** Data sovereignty, open source, distrust of cloud AI, technical curiosity.
**Friction Tolerance:** High (willing to compile, configure, and inspect).

---

## The Narrative

"I saw this on the front page of HN. 'Show HN: Chat with your Spotify history (100% client-side, WASM)'.

My immediate reaction was bullshit. There's no way an LLM is running efficiently in the browser with RAG over a 50MB JSON file without sending *something* to a server. But the repo is public, so I figured I'd audit it."

### 1. The Audit (First 30 Seconds)
"I open the site. First thing I do: **F12 -> Network Tab**.
I verify `Offline` mode in Service Workers just to see if it breaks. It doesn't load initially (obviously), but I reload with network on.
I see the WASM binary download (`transformers.js` related). Okay, standard local embeddings.
I disconnect my wifi.
I click **'Upload Data'**. It parses instantly. No outbound requests.
Okay, `dev` was telling the truth about the local parsing."

### 2. The Configuration (The "Aha" Moment)
"I go to Settings. I see 'Google Gemini' as the default. Immediate red flag.
But then I see the dropdown: **'Ollama (Local)'**.
*Nice.*
I already have Ollama running `llama3` on my machine.
I switch the endpoint to `http://localhost:11434`.
The status indicator goes green: `System Ready (Local)`.
I check the Network tab again. The requests are going to `localhost`.
Respect."

### 3. The Indexing Friction
"I upload my 8-year history file. It's chunky.
The UI says 'Indexing for Semantic Search...'.
I watch the console logs. It's chunking tracks and generating embeddings via the in-browser ONNX runtime.
My laptop fans spin up a bit.
It takes about 45 seconds.
`Indexed 12,408 tracks.`
Honest work. It's actually doing the math here, not an API call."

### 4. The "Gotcha" Test
"I reconnect wifi (needed for the initial UI assets, though I could have cached them) but keep the LLM local.
I ask a deliberately vague question to test the RAG retrieval:
*'What have I been listening to?'*

It responds:
*'I have 8 years of data here. Could you be more specific? Are you looking for your top genres, a specific year, or how your mood has changed?'*

Good. It's not hallucinating a generic answer.
I try again, testing its 'memory':
*'Show me the exact moment my taste in music shifted from upbeat pop to dark ambient. Cite specific tracks.'*

It thinks. (The token generation is slower because it's running on my GPU).
*'The shift is visible in **October 2019**.
In September, your top tracks were "Shut Up and Dance" and "Can't Stop the Feeling".
By November, your rotation was dominated by **Tim Hecker** ("Virgins") and **William Basinski** ("The Disintegration Loops").
The transition point appears to be the week of October 14th, where you played "dlp 1.1" 12 times in a row.'*

### 5. The Verdict
"I stare at the screen. I remember that week. That was when I got laid off.
It found the exact week my mental state cratered, purely through metadata.
And the best part? Google didn't see it. OpenAI didn't see it.
It's just a SQLite file (or IndexedDB, I guess) on my SSD.

I went back to the HN thread.
Commented: *'Actually works as advertised. inspected the network traffic, zero telemetry on the analysis. The WASM embedding implementation is clean. Starred.'*"
