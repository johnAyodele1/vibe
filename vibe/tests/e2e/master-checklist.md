# Vibe dating app: E2E Master Test Checklist (300-400 Scenarios)

This master checklist outlines and defines the exhaustive 300 to 400 precise end-to-end (E2E) test cases covering every user and provider flow, backend integrations, payment systems, web sockets, live broadcasting, call routing, and administrative moderation/processing on the Vibe platform.

---

## SECTION 1: Age Gate & Welcome Screen (Tests 1 - 20)
1. **[Age Gate]** Verify Age Gate renders correctly on first-time launch.
2. **[Age Gate]** Verify Age Gate contains mandatory checkboxes for "I am over 18", "I agree to Terms", and "I understand Adult Content warnings".
3. **[Age Gate]** Verify "Enter" button remains disabled when none of the checkboxes are checked.
4. **[Age Gate]** Verify "Enter" button remains disabled when only the "over 18" checkbox is checked.
5. **[Age Gate]** Verify "Enter" button remains disabled when only the "Agree to Terms" checkbox is checked.
6. **[Age Gate]** Verify "Enter" button remains disabled when only the "Adult Content warning" checkbox is checked.
7. **[Age Gate]** Verify "Enter" button remains disabled when any two checkboxes are checked but one is missing.
8. **[Age Gate]** Verify checking all three checkboxes enables the "Enter" button immediately.
9. **[Age Gate]** Verify clicking "Exit" redirects the user to an external safe site (e.g., Google).
10. **[Age Gate]** Verify clicking "Enter" sets `adultZoneVerified` in `localStorage` with a valid timestamp.
11. **[Age Gate]** Verify that once `adultZoneVerified` is set, visiting the site directly bypasses the Age Gate modal.
12. **[Age Gate]** Verify that clearing `localStorage` makes the Age Gate reappear on the next visit.
13. **[Age Gate]** Verify the Age Gate handles responsive layouts, rendering perfectly on screens down to 320px width.
14. **[Age Gate]** Verify that the Age Gate blocks any direct navigation attempt to `/adult/*` paths.
15. **[Welcome Screen]** Verify standard layout displays welcoming imagery and clear Call-To-Action (CTA) buttons.
16. **[Welcome Screen]** Verify "Explore Now" button behaves correctly for unauthenticated users (prompts sign-in/registration).
17. **[Welcome Screen]** Verify "View Live Now" button redirects the user directly to the `/cams` directory route.
18. **[Welcome Screen]** Verify smooth scrolling transitions function correctly when jumping down to featured grids.
19. **[Welcome Screen]** Verify layout consistency across dark themes, ensuring text contrasts meet accessibility guidelines.
20. **[Welcome Screen]** Verify SEO tags, meta descriptions, and page titles load correctly on initial page render.

---

## SECTION 2: User Authentication & Registration Flow (Tests 21 - 50)
21. **[Registration Modal]** Verify the Register Modal implements a single-column, highly responsive, mobile-first design.
22. **[Registration Modal]** Verify form inputs are stacked with labels placed cleanly above fields.
23. **[Registration Modal]** Verify input elements maintain standard heights of 52px for optimal touch interactions.
24. **[Registration Modal]** Verify the Country selection field utilizes the custom dropdown (`CustomSelect`) instead of a native select.
25. **[Registration Modal]** Verify the "Stage Name" input field is hidden by default for standard member signups.
26. **[Registration Modal]** Verify selecting the "Provider/Performer" role dynamically displays the mandatory "Stage Name" input field.
27. **[Registration Modal]** Verify interactive password eye-toggle toggles password input type between `password` and `text`.
28. **[Registration Modal]** Verify real-time password strength meter updates colors (red/yellow/green) as characters are typed.
29. **[Registration Modal]** Verify password strength meter displays appropriate textual helper levels (Weak, Medium, Strong).
30. **[Registration Modal]** Verify validation prevents submission with an invalid email address format.
31. **[Registration Modal]** Verify validation prevents submission with a password under 8 characters.
32. **[Registration Modal]** Verify registration validation requires the user's Date of Birth (DOB) and enforces an age of 18 or older.
33. **[Registration Modal]** Verify registration fails with a 400 error if the DOB indicates the applicant is under 18.
34. **[Registration Modal]** Verify successful registration assigns the proper role: `member` for standard, `provider` for performer.
35. **[Registration Modal]** Verify user token `adultAccessToken` is safely stored in `localStorage` upon registration success.
36. **[Registration Modal]** Verify the user is automatically logged in and redirected to their respective dashboard/homepage.
37. **[Login Modal]** Verify Login form handles basic credentials and fields cleanly.
38. **[Login Modal]** Verify login validation enforces proper email format and password length rules.
39. **[Login Modal]** Verify logging in with wrong credentials returns an appropriate HTTP 401/400 error message.
40. **[Login Modal]** Verify logging in with a non-existent email returns a graceful "User not found" or "Invalid credentials" error.
41. **[Login Modal]** Verify successful login sets `adultAccessToken` in `localStorage`.
42. **[Login Modal]** Verify subsequent requests automatically include the `Authorization: Bearer <token>` header.
43. **[Google Login]** Verify Google Authentication flow redirects to Google OAuth endpoint.
44. **[Google Login]** Verify successful OAuth callback handles token generation and user account creation / matching.
45. **[Google Login]** Verify cancel/error callbacks redirect back to the auth page with descriptive error toasts.
46. **[Logout]** Verify clicking logout clears the `adultAccessToken` and any cached user sessions from `localStorage`.
47. **[Logout]** Verify logout calls the server-side `/auth/logout` endpoint to invalidate the refresh token.
48. **[Logout]** Verify logged-out users are immediately redirected to the welcome page.
49. **[Logout]** Verify logged-out users are strictly barred from accessing private or paid routes.
50. **[Session Expiry]** Verify the app automatically requests token refreshment via `/auth/refresh` on credentials expiry.

---

## SECTION 3: Provider Onboarding & Profile Configuration (Tests 51 - 90)
51. **[Onboarding Wizard]** Verify the Onboarding Wizard displays 7 distinct steps in a clear progression tracker.
52. **[Onboarding Wizard]** Verify only step 1 (Basic Info) is active and clickable on first load.
53. **[Onboarding Wizard]** Verify steps 2-7 are locked (pointer-events none, greyed out) on fresh onboarding start.
54. **[Onboarding Wizard]** Verify the "DONE" tab is never clickable regardless of progress.
55. **[Onboarding Wizard]** Verify completing step 1 marks the first step tab green with a success checkmark.
56. **[Onboarding Wizard]** Verify onboarding progress saves automatically to `localStorage` and persists across page reloads.
57. **[Onboarding Wizard]** Verify fetching onboarding progress calls `GET /api/v1/adult/onboarding` on component mount.
58. **[Basic Details]** Verify provider Basic Details step requires Stage Name, Bio, and DOB.
59. **[Basic Details]** Verify provider Bio validation prevents empty descriptions or descriptions over 1000 characters.
60. **[Location Select]** Verify country dropdown triggers country-state-city cascades cleanly.
61. **[Location Select]** Verify selecting a country resets any previously chosen states and cities.
62. **[Location Select]** Verify state selection modal loads states only for the selected country.
63. **[Location Select]** Verify city selection modal loads cities only for the selected country and state.
64. **[Services Offered]** Verify provider can select multiple services (e.g., text, private video, voice notes, tonight requests).
65. **[Services Offered]** Verify toggling "Private Call" service dynamically reveals the per-minute rate input field.
66. **[Services Offered]** Verify untoggling "Private Call" hides the per-minute rate input field.
67. **[Pricing Configuration]** Verify provider rates allow setting Tonight Request flat fees and per-minute rates.
68. **[Pricing Configuration]** Verify rates have no minimum constraint other than being positive (must be >= 0 diamonds).
69. **[Pricing Configuration]** Verify provider can configure and customize their own Tip Menu items with custom titles and credit costs.
70. **[Media Upload]** Verify profile photos and onboarding media support direct upload via backend `/api/v1/adult/media/upload`.
71. **[Media Upload]** Verify files exceeding size limits (2MB for images, 5MB for video/audio) are rejected with a clear toast.
72. **[Media Upload]** Verify uploaded media utilizes the Cloudinary 0.4 quality multiplier for mobile-first compression.
73. **[Schedule Setup]** Verify the Weekly Availability Schedule allows toggling days of the week on and off.
74. **[Schedule Setup]** Verify availability hours allow specifying start and end times in 24-hour format.
75. **[Schedule Setup]** Verify hours validation rejects invalid time formats (e.g., `2nn3:59`, `25:00`).
76. **[Review & Submit]** Verify the final review screen summarizes all entered onboarding details.
77. **[Review & Submit]** Verify clicking submit transitions the provider account status from `onboarding` to `pending_verification`.
78. **[Onboarding API]** Verify `/api/v1/adult/providers/me/profile` updates database records with corresponding onboarding changes.
79. **[Onboarding API]** Verify `/api/v1/adult/providers/me/services` saves selected servicesOffered correctly.
80. **[Onboarding API]** Verify `/api/v1/adult/providers/me/pricing` correctly registers provider rate definitions.
81. **[Onboarding API]** Verify `/api/v1/adult/providers/me/pricing` rejects rates below 0 diamonds with an HTTP 400.
82. **[Onboarding API]** Verify `/api/v1/adult/providers/me/location` records matching country, state, and city on the provider document.
83. **[Onboarding API]** Verify standard members are blocked with HTTP 403 when trying to hit provider onboarding update APIs.
84. **[Profile Initialization]** Verify that the `getMyProfile` onboarding route automatically initializes missing configurations with safe defaults.
85. **[Profile Initialization]** Verify that if a provider has undefined schedule fields, `getMyProfile` resolves them with empty default arrays.
86. **[Profile Initialization]** Verify that if `stageName` is missing, `getMyProfile` initializes it with a username fallback.
87. **[Public View Profile]** Verify unauthenticated visitors trying to view a public provider profile are shown a "Login Required" screen.
88. **[Public View Profile]** Verify viewing public profile triggers an auth modal event `open-adult-auth-modal` when unauthenticated.
89. **[Public View Profile]** Verify authenticated users can query provider profiles seamlessly via `GET /api/v1/adult/providers/:providerId`.
90. **[Public View Profile]** Verify provider cards display the locked portrait aspect ratio of `aspect-[3/4]` to prevent layouts warping.

---

## SECTION 4: Nigerian Naira (₦) Integration & Exchange Calibration (Tests 91 - 120)
91. **[Currency Baseline]** Verify the app establishes Nigerian Naira (₦) as the unified system currency representation.
92. **[Currency Baseline]** Verify the baseline exchange rate is calibrated at exactly 1 Diamond = ₦100.
93. **[Exchange Rate Config]** Verify exchange rate is dynamically loaded from the database via `AppConfig` with the key `diamond_naira_rate`.
94. **[Exchange Rate Config]** Verify system boots with fallback configurations if the database AppConfig is not yet initialized.
95. **[Redis Caching]** Verify AppConfig diamond exchange rate is cached using Redis.
96. **[Redis Caching]** Verify system falls back to Redis fallback map `redisFallback.ts` if the active Redis server is unreachable.
97. **[Naira Formatting]** Verify whole numbers are formatted cleanly without decimal places (e.g., ₦1,000, not ₦1,000.00).
98. **[Naira Formatting]** Verify fractional amounts (including kobo) are rendered with exactly two decimal places (e.g., ₦1,500.50).
99. **[Naira Formatting]** Verify no US Dollar ($) or other non-Naira currency representations are displayed anywhere in the application.
100. **[Wallet Naira View]** Verify Wallet screen translates the user's Diamond balance into Naira equivalent using the exact exchange rate.
101. **[Bundle Pricing]** Verify bundle options are calculated mathematically without discounts (e.g., 100 Credits = ₦10,000; 500 = ₦50,000).
102. **[Bundle Pricing]** Verify bundle list yields 1500 Credits = ₦150,000 and 5000 Credits = ₦500,000.
103. **[Payment Gateways]** Verify Stripe checkouts initiate with NGN values scaled to the smallest currency unit (kobo, i.e., Naira * 100).
104. **[Payment Gateways]** Verify Stripe purchases request successful transactions in NGN.
105. **[Platform Fee Model]** Verify that standard members are charged exactly the baseline rate (no 1.15x price markup applied).
106. **[Platform Fee Model]** Verify pricing helper `pricingService.ts` has completely deprecated and removed any historical 1.15x member markup.
107. **[Earnings Split]** Verify platform fee calculation engine `/backend/src/shared/fees.ts` processes a strict 15% platform cut.
108. **[Earnings Split]** Verify platform fee calculation awards exactly 85% of standard transactions to the provider's earnings wallet.
109. **[Platform Cut Logs]** Verify a tip of 100 Credits subtracts exactly 100 from the member and adds exactly 85 to the provider's balance.
110. **[Platform Cut Logs]** Verify the 15-credit difference is created as a `PlatformEarning` model record.
111. **[Platform Cut Logs]** Verify credit transactions log the `platformFee` and populate the `eligibleForPayout` boolean field correctly.
112. **[Conversion History]** Verify Admin dashboard tracks conversion rates and logs changes made by administrators in the system settings.
113. **[System Calibration]** Verify changing `diamond_naira_rate` to ₦150 updates all frontend price estimates in real-time.
114. **[Conversion Math]** Verify a transaction of 5 Diamonds under a rate of ₦100 displays a Naira estimate of exactly ₦500.
115. **[Conversion Math]** Verify floor rounding is applied during credit-to-Naira conversions to avoid floating decimal overflows.
116. **[Conversion Math]** Verify fractional kobo calculations are consistently rounded down to the nearest kobo unit.
117. **[Exchange API]** Verify `GET /api/v1/adult/wallet/rate` returns the live exchange rate configuration.
118. **[Exchange API]** Verify only administrators are authorized to execute `PUT /api/v1/adult/wallet/rate` to calibrate rates.
119. **[Conversion Fallbacks]** Verify frontend UI displays standard conversion notices if the rate API temporarily fails to load.
120. **[Financial Reports]** Verify payout exports and transaction logs display all currencies pre-formatted with the Naira symbol '₦'.

---

## SECTION 5: Wallet Refills, Stripe, and Purchase Logs (Tests 121 - 150)
121. **[Wallet Panel]** Verify Wallet main view fetches active diamond balance on load.
122. **[Wallet Panel]** Verify Wallet loads purchase bundles from `GET /api/v1/adult/wallet/bundles`.
123. **[Wallet Panel]** Verify Wallet shows a list of recent transaction history records.
124. **[Bundle Selection]** Verify clicking a purchase bundle triggers a purchase dialog.
125. **[Stripe Webhooks]** Verify Stripe checkout creation generates a valid session ID.
126. **[Stripe Webhooks]** Verify Stripe success callback triggers credits addition dynamically.
127. **[Stripe Webhooks]** Verify Stripe cancel callback displays a descriptive purchase cancelled message.
128. **[Credit Transactions]** Verify database transaction entries correctly log purchases with type `deposit`.
129. **[Credit Transactions]** Verify deposits are assigned `status: completed` once Stripe payment confirms.
130. **[Concurrency Check]** Verify rapid, repetitive clicks on bundle purchase CTAs are debounced to prevent duplicate checkout requests.
131. **[User Balance Update]** Verify user's wallet credit balance updates instantly upon successful deposit transaction.
132. **[Negative Balance Prevention]** Verify wallet ledger balances can never drop below 0 credits under any standard circumstances.
133. **[Stripe Webhook Validation]** Verify Stripe webhook validation handles raw body signature checks accurately.
134. **[Stripe Webhook Validation]** Verify duplicate webhook payloads are rejected and do not award double credits.
135. **[Transaction Logs Pagination]** Verify transaction tables utilize smooth client-side or server-side pagination controls.
136. **[Naira Equivalency Indicator]** Verify Naira baseline calculations are listed alongside credit values on each purchase tier.
137. **[Top Navigation Quick Link]** Verify the layout navigation bar features a diamond symbol link next to the user's profile.
138. **[Top Navigation Quick Link]** Verify clicking the navbar diamond link routes the user directly to the `/wallet` panel.
139. **[Free Rewards Check-In]** Verify user can complete the daily check-in task to earn free diamond credits.
140. **[Free Rewards Check-In]** Verify daily check-in adds credits dynamically based on the configured values in the database.
141. **[Dynamic Rewards Config]** Verify `RewardsSheet.tsx` fetches check-in tasks dynamically from `GET /v1/adult/rewards/tasks`.
142. **[Daily Limit Enforcement]** Verify daily check-in records are checked, and users cannot complete the same check-in task twice within 24 hours.
143. **[Check-in Atomicity]** Verify checking in utilizes atomic database increments (`$inc`) to prevent credit racing bugs.
144. **[Admin Rewards Board]** Verify Admin dashboard `/admin/rewards` lists all check-in logs and user reward status histories.
145. **[Admin Rewards Board]** Verify Admins can create, read, update, and delete daily tasks on `/admin/rewards`.
146. **[Reward Metrics]** Verify user task completions update the overall reward program analytic reports.
147. **[Deposit Failures]** Verify failed Stripe transactions do not increment the user's credit balances.
148. **[Deposit Failures]** Verify failed checkout requests are logged in the database with status `failed`.
149. **[Credit Rollback]** Verify system can perform balance rollbacks if a deposit is later flagged as disputed or fraudulent.
150. **[Audit Trail]** Verify every transaction is recorded with user id, amount, previous balance, current balance, and timestamp.

---

## SECTION 6: Hook Up Tonight & Location-Based Maps (Tests 151 - 180)
151. **[Hook Up Tonight]** Verify Hook Up Tonight page queries nearby providers using `GET /api/v1/adult/hookup/nearby`.
152. **[Location Query]** Verify proximity filtering utilizes the member's profile location (Country, State, City).
153. **[Location Query]** Verify results fallback safely to standard performers if no direct regional matches are found.
154. **[Map Interface]** Verify map view option triggers rendering of the custom Leaflet map layout centered correctly.
155. **[Map Interface]** Verify Leaflet map layers utilize CARTO dark-matter tiles for styled themes.
156. **[Map Interface]** Verify map markers are customized as SVG circles for maximum rendering performance.
157. **[Map Markers]** Verify active/online providers are shown as green (#22c55e) circle markers.
158. **[Map Markers]** Verify offline providers are shown as red/crimson (#c8102e) circle markers.
159. **[Interactive Popups]** Verify clicking a provider marker opens a styled popup overlay.
160. **[Interactive Popups]** Verify popup contains provider photo, stage name, tonight rate, distance, and quick chat buttons.
161. **[Interactive Popups]** Verify popup "Send Message" action opens the private sext panel directly with that performer selected.
162. **[Grid Interface]** Verify toggling to grid list mode displays provider card layouts dynamically.
163. **[Service Requests]** Verify clicking "Request Tonight" triggers a Service Tonight overlay with rate calculations.
164. **[Service Requests]** Verify service request checks that the target provider has an active tonight rate configured.
165. **[Service Requests]** Verify tonight requests pre-validate that the member does not have an active duplicate pending request with the same provider.
166. **[Service Requests]** Verify tonight requests block with `NO_TONIGHT_RATE` error if the provider rate is undefined or zero.
167. **[Service Requests]** Verify tonight requests block with `ACTIVE_REQUEST_EXISTS` if there is a pending dispute or outstanding open request.
168. **[Online Synchronization]** Verify map markers and provider card lists connect to the global `/adult` namespace socket.
169. **[Online Synchronization]** Verify cards and markers update instantly on `provider:online` events.
170. **[Online Synchronization]** Verify cards and markers update instantly on `provider:offline` events.
171. **[Filter Controls]** Verify filtering list by online status hides offline performers immediately.
172. **[Filter Controls]** Verify filtering list by specific services (e.g., video calls) limits card results correctly.
173. **[Layout Stability]** Verify cards preserve a strict portrait aspect ratio `aspect-[3/4]` across all view modes.
174. **[Image Scaling]** Verify cards render profile pictures with absolute overlays using `object-cover` and `object-top` styling.
175. **[No Distortion]** Verify card grids handle dynamic image widths and heights without breaking the row structures.
176. **[Distance Formatting]** Verify distances from the user are computed accurately and formatted nicely (e.g. "Within 5 km").
177. **[No Location Fallback]** Verify user is prompted to set their location if they navigate to Hook Up Tonight without location info in their profile.
178. **[Location Redirect]** Verify clicking set location modal button routes the user directly to their edit profile panel.
179. **[Marker Overlaps]** Verify Leaflet marker clustering is configured to avoid overlaps when multiple providers reside in the same city.
180. **[API Security]** Verify coordinates and raw addresses are sanitized in the API to protect provider privacy.

---

## SECTION 7: Private Messages, Sexting, and Media Unlocks (Tests 181 - 210)
181. **[Private Sexting]** Verify Private Sext page `PrivateSext.tsx` loads conversation lists on initial open.
182. **[Auto-Selection]** Verify page automatically parses conversation IDs from query parameters (e.g., `?conversation=id`).
183. **[Auto-Selection]** Verify page automatically parses conversation IDs from route parameters (e.g., `/sext/:conversationId`).
184. **[Auto-Selection]** Verify page correctly compares target IDs against current selections to prevent infinite re-render loops.
185. **[Auto-Selection]** Verify switching conversations clears the active messages state immediately to prevent layout overlap flashes.
186. **[Race Conditions]** Verify message fetch results are safely discarded if the user switches threads before the pending request completes.
187. **[Scrolling]** Verify opening a conversation triggers an immediate auto-scroll directly to the very bottom.
188. **[Scrolling]** Verify scrolling is triggered within a short timeout coordinate (50ms/150ms) to ensure proper layout updates.
189. **[Delivery Receipts]** Verify chat messages implement WhatsApp-style status checks.
190. **[Delivery Receipts]** Verify a message delivered but not yet read displays a double tick using the SVG `MessageTick` component.
191. **[Delivery Receipts]** Verify a message read by the recipient displays a double crimson tick in the chat view.
192. **[Delivery Receipts]** Verify background socket actions trigger immediate read state updates when both parties are in the same room.
193. **[Delivery Receipts]** Verify unread messages trigger standard badge counts on the navigation layout.
194. **[Delivery Receipts]** Verify message status changes cascade smoothly with a 30ms stagger animation.
195. **[Input Validation]** Verify typing contact sharing items (e.g., phone numbers, WhatsApp, Snap) triggers floating relative warning popups.
196. **[Hard-Blocking]** Verify sending contact sharing messages is strictly blocked on the client side, showing an error box and forcing edits.
197. **[Hard-Blocking]** Verify contact sharing messages are hard-blocked on the backend, returning HTTP 400 content violation.
198. **[Secondary Photos]** Verify secondary provider pictures (index > 0) are blurred behind a single-credit diamond unlock system.
199. **[Secondary Photos]** Verify unauthenticated or free-tier members are shown a "💎 1 to unlock" CTA overlay.
200. **[Secondary Photos]** Verify clicking unlock decrements 1 credit from the user and adds 1 credit to the provider.
201. **[Secondary Photos]** Verify successful unlock reveals the clear, unblurred secondary photo immediately.
202. **[Secondary Photos]** Verify unlocked photos remain permanently unlocked for that user across future sessions.
203. **[Layout Stability]** Verify textual message bubbles implement Tailwind `break-words` styling to prevent layout breaks from long non-spaced strings.
204. **[Voice Notes]** Verify recording a voice note flushes media data cleanly right before stopping the recorder.
205. **[Voice Notes]** Verify empty recordings are caught and not submitted to the backend upload servers.
206. **[Voice Notes]** Verify completed voice notes are saved with correct audio mime-types in a proper file envelope wrapper.
207. **[Presence Updates]** Verify chat headers display live user presence status indicators (Online/Offline) in real-time.
208. **[Call Initiations]** Verify launching a video/audio call checks if the user has sufficient wallet credits for at least 1 minute of call duration.
209. **[Call Initiations]** Verify launching a call with insufficient credits triggers a toast prompting "Insufficient tokens. Please get more tokens."
210. **[Call Initiations]** Verify clicking the insufficient tokens toast redirects the user directly to `/wallet`.

---

## SECTION 8: Provider Live Streaming & webcam Dashboard (Tests 211 - 240)
211. **[Live Streaming]** Verify Live Cams page `/cams` lists all active performer cam sessions from the database.
212. **[Live Streaming]** Verify clicking "Go Live" from the provider dashboard mounts the stream panel on `/adult/provider/live`.
213. **[Live Streaming]** Verify "Go Live" button state on provider dashboard queries `GET /api/adult/cams/my-active-session` to show active live status.
214. **[Web Socket Join]** Verify going live opens a dynamic Web Socket connection room under the custom name `cam:${sessionId}`.
215. **[Viewer Counter]** Verify spectator joins and exits update live viewer counters in real-time.
216. **[Spectator Chat]** Verify live spectator chat utilizes ephemeral socket rooms to bypass database overhead blocks.
217. **[Spectator Chat]** Verify tipping notifications and custom messages are broadcast successfully within the live stream.
218. **[Stream Cleanups]** Verify server restarts execute auto-cleanups to terminate active stream sessions.
219. **[Stream Cleanups]** Verify provider socket disconnects terminate and mark the corresponding `CamSession` as `ended`.
220. **[Tipping Sheet]** Verify viewers can open a dynamic tipping drawer `/live` on desktop and mobile.
221. **[Tipping Sheet]** Verify tipping sheet displays custom tip menus loaded from the provider profile.
222. **[Tipping Sheet]** Verify clicking a preset tipping option checks the user's diamond balance in real-time.
223. **[Tipping Sheet]** Verify sending a tip processes transactions atomically: subtracts credits from user, awards 85% to provider, keeps 15% platform cut.
224. **[Spin Wheel]** Verify active providers can configure their spin wheel choices via the Wheel Editor.
225. **[Spin Wheel]** Verify Wheel Editor supports addition, editing, and deletion of spin segments with specific credit costs.
226. **[Spin Wheel]** Verify viewers can pay configured credits to spin the provider's active wheel.
227. **[Spin Wheel]** Verify spin requests validate wallet balances, deduct credits, and process platform fee shares atomically.
228. **[Spin Wheel]** Verify wheel spins emit a `cam:wheel_spin` event with the resulting segment outcome to all room spectators.
229. **[Spin Wheel]** Verify the spin wheel frontend animates SVG elements smoothly and displays the winner selection dialog.
230. **[Stream Tools]** Verify provider live dashboard has a "Stream Tools" link section below the tipping card.
231. **[Stream Tools]** Verify clicking "Stream Tools" slides in the Wheel Editor panel cleanly on desktop layout.
232. **[Stream Tools]** Verify clicking "Stream Tools" opens a Wheel Editor bottom drawer on mobile layout.
233. **[Mobile Optimization]** Verify spectator live view chat drawers provide a `z-40` backdrop wrapper.
234. **[Mobile Optimization]** Verify tapping outside the spectator chat sheet dismisses the drawer cleanly.
235. **[Zustand Stores]** Verify tip sheet pricing states are initialized globally to prevent hook rendering violations.
236. **[Chat Auto-Scroll]** Verify the stream chat area implements reliable auto-scroll to show incoming messages and tips instantly.
237. **[Cam Thumbnails]** Verify server captures and updates active stream thumbnails using Cloudinary upload APIs.
238. **[End Stream]** Verify provider clicking "Stop Stream" calls `POST /api/adult/cams/stop` and closes the webcam stream cleanly.
239. **[Viewer Limits]** Verify that standard members are blocked from joining stream rooms once they run out of active watch credit tokens.
240. **[Stream Moderation]** Verify admins can force-terminate a stream room from the admin control center.

---

## SECTION 9: Premium Calls & Global Ringing Routing (Tests 241 - 270)
241. **[Premium Calls]** Verify global layout file `AdultZoneLayout.tsx` maintains a persistent socket connection to `/adult` namespace.
242. **[Call Sockets]** Verify call socket connection is skipped if the user is currently on the dedicated messaging or sexting views.
243. **[Incoming Call]** Verify receiving a `call:incoming` event launches a gorgeous full-screen ringing overlay.
244. **[Incoming Call]** Verify ringing overlay displays caller avatar, name, and "Decline" / "Accept" CTA action buttons.
245. **[Decline Call]** Verify clicking "Decline" emits `call:declined` socket event and dismisses the ringing overlay instantly.
246. **[Accept Call]** Verify clicking "Accept" emits `call:accepted` and redirects the user to their respective sext chat panel.
247. **[Call Redirect]** Verify acceptance redirect appends query parameters `autoAcceptCallId`, `callerId`, and `type`.
248. **[Auto-Call accepts]** Verify Private Sext and Provider Messages panels parse incoming query parameters.
249. **[Auto-Call accepts]** Verify panels select the caller's active conversation, auto-trigger the call acceptance API, and clear search parameters.
250. **[Billing Scenarios]** Verify calls lasting less than 10 seconds are billed at exactly 0 diamonds.
251. **[Billing Scenarios]** Verify calls lasting 11 seconds bill the user for exactly 1 minute of call time.
252. **[Billing Scenarios]** Verify calls lasting 61 seconds bill the user for exactly 2 minutes of call time.
253. **[Billing Scenarios]** Verify billing calculates platform fee shares: 85% to provider, 15% to platform earnings.
254. **[Insufficient Credits]** Verify users are automatically disconnected from the active call when their diamond balance drops below the provider rate.
255. **[Call Ended Sockets]** Verify ending a call on either side emits `call:ended` and cleans up video connections.
256. **[Missed Call Logs]** Verify unanswered calls emit `call:missed` and log missed call notifications on both sides.
257. **[Zego integration]** Verify Call Room initializes Agora/Zego SDK instances exactly once on mount to avoid memory leaks.
258. **[Audio Calls]** Verify audio-only calls display a clean dark gradient layout with large partner avatars and waveforms.
259. **[Video Calls]** Verify video calls display partner webcam streams in full screen with local stream floating in a picture-in-picture window.
260. **[Device Checks]** Verify call screen handles missing webcam/microphone permissions gracefully and shows warnings.
261. **[Mute Actions]** Verify toggling audio mute stops sending microphone data cleanly.
262. **[Camera Toggles]** Verify toggling camera off stops sending video frames cleanly.
263. **[Call Layout Stability]** Verify call interface scales perfectly across desktop, tablet, and mobile dimensions.
264. **[Database Records]** Verify completed calls create billing and history transaction records with type `call_duration`.
265. **[Database Records]** Verify calls that were never connected are recorded in the database with status `missed` or `declined`.
266. **[Connection Retries]** Verify the call room automatically attempts reconnection if the network briefly drops.
267. **[Call Quality Stats]** Verify call overlays can display network strength and connection quality indicator icons.
268. **[Simultaneous Calls]** Verify receiving a second incoming call while already in an active call auto-declines with a busy signal.
269. **[Call History Lists]** Verify user call log histories display duration, rate, total diamonds spent, and caller profiles.
270. **[Zego Token Generation]** Verify backend `/api/v1/adult/calls/token` route generates valid RTC access tokens.

---

## SECTION 10: Service Requests, Disputes, and Escrow Flows (Tests 271 - 300)
271. **[Service Requests]** Verify members can send Service Requests from the chat input quick actions toolbar.
272. **[Service Requests]** Verify Service Request drawer pre-fills tonightRate and prevents edits to base rates.
273. **[Service Requests]** Verify members can add extra service charges with dynamic description inputs.
274. **[Service Requests]** Verify service total costs update in real-time as extra line items are configured.
275. **[Service Requests]** Verify sending a Service Request creates an escrow hold of the total diamond cost.
276. **[Escrow Hold]** Verify escrow holds subtract diamonds from the user's wallet and create a transaction marked `eligibleForPayout: false`.
277. **[Chat Rendering]** Verify provider-side service bubble displays dynamic pricing breakdowns, custom notes, and payment status badges.
278. **[Chat Rendering]** Verify provider-side service bubble mirrors the premium dark gradient (`#1b0a14` to `#0d040a`) and gold border styling.
279. **[Request Acceptance]** Verify provider can click "Accept Request", transition service status to `accepted`, and log the action.
280. **[Request Rejection]** Verify provider can click "Decline Request", which returns the held escrow diamonds to the member's wallet.
281. **[Request Completion]** Verify member can click "Mark Completed" once the service tonight is fully rendered.
282. **[Request Completion]** Verify marking completed transitions service status to `completed` and updates transaction `eligibleForPayout: true`.
283. **[Disputes]** Verify members can click "Dispute/Report Service" if the provider failed to deliver.
284. **[Disputes]** Verify reporting a dispute marks the service transaction with `inDispute: true` and freezes payout eligibility.
285. **[Disputes]** Verify disputes save a `Report` document of type `service_dispute` in the database.
286. **[Disputes]** Verify disputed service chats render specialized warning/notice boxes in both member and provider message views.
287. **[Platform Fee Shares]** Verify completed service payouts calculate fee splits: 85% to provider, 15% platform fee recorded.
288. **[Service Cancel]** Verify members can cancel pending service requests that have not been accepted by the provider yet.
289. **[Service Cancel]** Verify cancelling a pending request automatically releases the escrow diamonds back to the member's wallet.
290. **[Service Expiry]** Verify the system automatically expires and cancels service requests that have not been accepted after 24 hours.
291. **[Duplicate Prevention]** Verify dynamic busy states `isSendingServiceRequest` prevent duplicate service submissions from rapid double clicking.
292. **[Attachment Uploads]** Verify members can attach image proofs to service requests to aid in dispute resolution.
293. **[Dispute Notes]** Verify submitting a dispute requires entering a minimum 20-character description of the issue.
294. **[Escrow Ledger]** Verify escrow balance records are tracked separately under the system balance sheet analytics.
295. **[Historical Records]** Verify provider dashboard lists all historical completed, disputed, and cancelled services.
296. **[Service Chat Integration]** Verify accepted service requests post an automated systemic message in the private chat conversation history.
297. **[Notification Alerter]** Verify providers receive real-time push/in-app notifications when a member submits a Service Tonight request.
298. **[Notification Alerter]** Verify members receive real-time push/in-app notifications when a provider accepts their Service Tonight request.
299. **[Rating Prompts]** Verify completed services prompt the member to leave a 1-5 star review for the provider.
300. **[Rating Sync]** Verify submitted ratings update the provider's average star rating and review counts in the system database.

---

## SECTION 11: Moderation, Violations, and Security (Tests 301 - 330)
301. **[Moderation]** Verify backend filters all unencrypted private messages via `detectContactSharing` prior to database persistence.
302. **[Hard-Blocking]** Verify contact sharing violations are recorded in the `ContentViolation` database collection.
303. **[Hard-Blocking]** Verify the blocked message is omitted from chat histories, and the sender receives an HTTP 400 validation response.
304. **[Violation Count]** Verify accumulating 3+ provider content violations within a 7-day window triggers an administrative alert check.
305. **[Admin Notifications]** Verify violation thresholds emit an `admin:violation_threshold` real-time socket event.
306. **[User Reporting]** Verify standard users can report a provider profile for inappropriate content or scams.
307. **[User Reporting]** Verify reports create a `Report` document in the database and append it to the admin moderation list.
308. **[Content Filters]** Verify the shared package `@yourapp/content-filter` detects 11-digit Nigerian phone numbers (e.g., `08123456789`).
309. **[Content Filters]** Verify content-filter flags numbers containing spaces or dashes (e.g., `0812-345-6789`, `0812 345 6789`).
310. **[Content Filters]** Verify content-filter flags numbers with standard country codes (e.g., `+2348123456789`).
311. **[Content Filters]** Verify content-filter does NOT flag prices or credit amounts (e.g., `1000`, `500 credits`).
312. **[Content Filters]** Verify content-filter flags variations of "WhatsApp" (e.g., `wh4tsapp`, `w h a t s a p p`, `watsup`, `whats app`).
313. **[Content Filters]** Verify content-filter flags variations of "Snapchat" (e.g., `snapchat`, `sn4pchat`, `s.n.a.p.c.h.a.t`).
314. **[Content Filters]** Verify content-filter flags variations of "Instagram" (e.g., `@username`, `insta`, `follow me on ig`).
315. **[Content Filters]** Verify content-filter flags variations of "Telegram" (e.g., `t.e.l.e.g.r.a.m`, `t3l3gram`, `telg`).
316. **[Content Filters]** Verify content-filter flags email addresses (e.g., `user@gmail.com`, `user [at] gmail.com`, `user@domain dot com`).
317. **[Content Filters]** Verify content-filter flags off-platform transition phrases (e.g., `let's chat outside`, `reach me outside`).
318. **[Content Filters]** Verify content-filter does NOT flag standard friendly statements (e.g., "Sounds good to me", "500 diamonds").
319. **[Admin Dashboard Actions]** Verify administrators can log in to the admin dashboard at `/admin/login` using secure credentials.
320. **[Admin Dashboard Actions]** Verify incorrect admin login credentials return clear error messages.
321. **[Admin Dashboard Actions]** Verify admin token is securely stored and handles authorization rules cleanly.
322. **[Admin Dashboard Actions]** Verify non-admin users are blocked with HTTP 403 when attempting to access `/admin/*` routes.
323. **[Admin User Management]** Verify admins can query list of registered users via `/api/admin/users`.
324. **[Admin Block Action]** Verify admins can block a user account, changing status to `blocked` and revoking active access tokens.
325. **[Admin Delete Action]** Verify admins can hard-delete a user account, erasing sensitive personal info and media associations.
326. **[Admin Violation Review]** Verify admins can view, resolve, and dismiss content violations from the admin dashboard center.
327. **[Admin Report Center]** Verify admins can view details of reported profiles, including reporter notes and screenshot media.
328. **[IP Rate Limiting]** Verify backend rate limiting prevents brute-force login attempts (returns HTTP 429).
329. **[Secure Headers]** Verify backend implements Helmet security headers to protect against clickjacking and XSS.
330. **[CORS Safeguards]** Verify CORS configurations permit requests only from configured domain origins.

---

## SECTION 12: Admin Analytics & Payout Management (Tests 331 - 365)
331. **[Admin Analytics]** Verify the Admin Analytics dashboard `/admin/analytics` tracks overall system indicators.
332. **[Admin Analytics]** Verify analytics track total members, total providers, active streams, and transaction statistics.
333. **[DAU Tracking]** Verify Daily Active Users (DAUs) are tracked using Redis `sadd` operations with map fallbacks.
334. **[DAU Snapshots]** Verify midnight cron jobs snapshot DAU records and persist them to the `DailyStat` database model.
335. **[Data Visualization]** Verify `/admin/analytics` renders dark luxury-themed Recharts graphs for registration trends.
336. **[Site Visit Tracking]** Verify overall site visits are recorded and incremented correctly via `/api/analytics/visit`.
337. **[Payout Process]** Verify Admin Payout Processing dashboard is mounted and accessible at `/admin/payouts`.
338. **[Payout Queue Status]** Verify Payouts panel contains stage tabs for Pending, Verifying, Processing, Completed, Rejected, and Disputes.
339. **[Payout Queue Status]** Verify PayoutRequest records on the backend support status stages: `queued`, `verifying`, `processing`, `completed`, `rejected`.
340. **[Payout Balance Verification]** Verify provider payout requests validate that the requested balance is below or equal to their eligible earnings.
341. **[Payout Balance Verification]** Verify creating a payout request sets the transaction record status to `queued`.
342. **[Eligible Payouts API]** Verify `GET /api/v1/adult/providers/me/payout/eligible` displays the provider's active claimable earnings.
343. **[Eligible Payouts API]** Verify only transactions with `eligibleForPayout: true` and `inDispute: false` are summed in eligible payouts.
344. **[Payout Thresholds]** Verify payout requests fail with HTTP 400 if the provider's eligible balance is below the minimum threshold (e.g. 50 Credits).
345. **[Admin Payout Actions]** Verify admins can transition a payout request from `queued` to `verifying` to lock the claim during audit.
346. **[Admin Payout Actions]** Verify admins can transition a payout request from `verifying` to `processing` during bank transfer steps.
347. **[Payout Rejection]** Verify admins can reject a payout request, requiring them to input an administrative rejection reason.
348. **[Payout Rejection]** Verify rejecting a payout request releases the held earnings back to the provider's active eligible balance.
349. **[Payout Completion]** Verify admins can mark a payout request as `completed`, requiring them to input a reference/receipt number.
350. **[Payout Completion]** Verify completing a payout deducts the corresponding credit amount from the provider's database balance.
351. **[Disputed Payouts]** Verify admins can review payout requests associated with disputed service tonight orders.
352. **[Disputed Payouts]** Verify admins can uphold a dispute, transferring the held escrow diamonds back to the member.
353. **[Disputed Payouts]** Verify admins can dismiss a dispute, releasing the held escrow earnings to the provider.
354. **[Payout History Logs]** Verify provider payout history list updates in real-time as requests advance through the stages.
355. **[Payout Estimates]** Verify provider payout screen displays step-by-step guides, queue status trackers, and arrival time estimations.
356. **[Payout Estimates]** Verify payout screen uses beautiful Lottie-react animations for status progress representation.
357. **[Financial Balance Sheet]** Verify transaction logs reflect administrative completed payouts with correct reference tags.
358. **[Admin Audit logs]** Verify every action taken by an admin on payouts is recorded in a system admin audit log collection.
359. **[Export Options]** Verify admins can export payout completion records to CSV spreadsheets.
360. **[Duplicate Request Checks]** Verify providers cannot submit a new payout request while they have an existing request in progress (`queued`/`verifying`/`processing`).
361. **[Provider Bank Settings]** Verify providers can update their payment/bank information details from the payout settings panel.
362. **[Bank Fields Validation]** Verify bank information fields validate account number length and routing/sort codes.
363. **[Payout API Guard]** Verify standard members are blocked from querying payout requests list APIs.
364. **[Payout API Guard]** Verify unauthorized providers cannot view or mutate payout requests belonging to other providers.
365. **[Analytics Cache Cleanups]** Verify changing system config settings flushes cached dashboard analytics to force data synchronization.

---

## SECTION 13: Core System Reliability, Sockets, and Edge Cases (Tests 366 - 400)
366. **[Socket Presence]** Verify user connection sockets under the global `/adult` namespace automatically increment connection presence counters.
367. **[Socket Presence]** Verify socket disconnects decrement connection presence counters.
368. **[Presence Fields Sync]** Verify presence system updates `isOnline` and `onlineSince` fields on the `AdultUser` model.
369. **[Presence Fields Sync]** Verify presence system updates nested provider profile presence properties `providerProfile.isOnline`.
370. **[Socket Presence]** Verify connection updates broadcast `user:status` socket alerts to active chat participants.
371. **[Presence Listeners]** Verify frontend chat interfaces listen to presence updates and dynamically toggle online state indicators.
372. **[Socket Broadcasts]** Verify going live emits `provider:online` socket notifications to all visitors on the welcome/hookup pages.
373. **[Socket Broadcasts]** Verify ending a stream emits `provider:offline` socket notifications to active clients.
374. **[Express Route Precedence]** Verify specific routes (e.g. `/me`, `/me/profile`) are defined *before* wildcard parameterized routes (e.g. `/:providerId`) to prevent hijacking.
375. **[ObjectId Validation]** Verify Express routes validate parameters with `mongoose.Types.ObjectId.isValid` to return HTTP 400 instead of CastErrors.
376. **[Dual-Module Filters]** Verify `@yourapp/content-filter` dual-module packaging builds to CommonJS (`dist/index.js`) and ESM (`dist/esm/index.js`) cleanly.
377. **[Dual-Module Filters]** Verify Node.js backend imports CommonJS content-filter modules without execution exceptions.
378. **[Dual-Module Filters]** Verify Vite/React frontend imports ESM content-filter modules without execution exceptions.
379. **[Socket Mocks]** Verify frontend tests mock `socket.io-client` completely to prevent vitest thread crashes and worker memory leaks.
380. **[Jest Disconnections]** Verify backend controllers verify `mongoose.connection.readyState === 1` before launching asynchronous background tasks.
381. **[Jest Disconnections]** Verify background operations do not execute queries during Jest teardown to avoid MongoNotConnected errors.
382. **[Compression Flow]** Verify frontend chat pictures are compressed on-the-fly using `browser-image-compression` to conform to 2MB limits.
383. **[Chat Layout Ellipsis]** Verify conversation list panels apply flex constraints (`min-w-0 flex-grow`) and text ellipsis truncation on long performer names.
384. **[Message Bubbles Dynamic Heights]** Verify message feeds auto-scroll perfectly regardless of whether chat text, photos, voice notes, or tips are rendered.
385. **[Rapid Button Clicks]** Verify premium action buttons (e.g., Send Tip, Gift Request) utilize lock states `processingIds` to block double charge races.
386. **[Gift Catalogue Skeleton Loader]** Verify gift request dialogues render 6 pulsing grey skeleton placeholders while retrieving catalog items.
387. **[Mobile Header Restriction]** Verify mobile chat headers are locked to a fixed height of `56px` to avoid layout overlapping.
388. **[Mobile Header Truncation]** Verify chat headers apply `white-space: nowrap` and `text-overflow: ellipsis` on status indicators to prevent wrapping on small displays.
389. **[Cloudinary API Config]** Verify Cloudinary constants `IMAGE_QUALITY` and `VIDEO_QUALITY` are configured as numeric integers (`40`) to prevent upload api failures.
390. **[Authenticated Media Access]** Verify locked private media uploaded to Cloudinary maps with `cloudinaryPublicId` in the message schemas.
391. **[Signed URLs Resolution]** Verify the app dynamically generates and resolves short-lived signed secure Cloudinary URLs during message query API calls.
392. **[Signed URLs Resolution]** Verify signed media URLs are resolved on-demand when users unlock media content using diamonds.
393. **[Database Isolation]** Verify testing databases utilize unique memory collections (`mongodb-memory-server`) to ensure unit tests are completely isolated.
394. **[DB Transactions Rollbacks]** Verify failed transactional balance operations roll back all state mutations across models atomically.
395. **[Secure Password Hashing]** Verify registration and login passwords utilize strong bcrypt salt calibrations.
396. **[JWT Expiry Checks]** Verify user authentication middleware rejects expired or corrupted JSON Web Tokens (returns HTTP 401).
397. **[CORS Allowed Methods]** Verify backend routes strictly validate acceptable HTTP methods, rejecting inappropriate requests with HTTP 405.
398. **[Static Files Compression]** Verify Vite production build compresses static assets for faster mobile loading times.
399. **[Eslint Rules Check]** Verify codebase compiles and passes ESLint static analysis rules without any critical errors.
400. **[TypeScript Types Safety]** Verify frontend and backend source files pass complete TypeScript compiler checks without compiling errors.
