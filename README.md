# VapiShowAssist

VapiShowAssist is a web application that automates real estate showing scheduling using Vapi.ai’s AI voice assistant for outbound calls and Supabase for lead management. Upload leads via CSV, initiate personalized calls to schedule showings, and view confirmed appointments in a dynamic interface.

[Live Demo](https://vapishowassist.vercel.app)  
[GitHub Repository](https://github.com/arulprakasht/VapiShowAssist)  
[Demo Video](https://youtube.com/your-demo-video-link) *(Add link after recording)*

## Features
- **Lead Upload**: Upload CSV files with lead details (name, phone, preferred_time, showing_address).
- **AI-Powered Calls**: Initiate outbound calls with Vapi.ai’s assistant to schedule showings with personalized messages.
- **Real-Time Updates**: View and manage leads with real-time status changes in the "Scheduled Showings" table.
- **Secure Backend**: Built with Express, secured with Helmet, CORS, and rate limiting.
- **Responsive UI**: Modern design with Tailwind CSS, optimized for desktop and mobile.
- **Scalable Deployment**: Hosted on Vercel with a serverless architecture.

## Tech Stack
- **Backend**: Node.js, Express, Vapi.ai API, Supabase
- **Frontend**: HTML, JavaScript, Tailwind CSS, PapaParse
- **Deployment**: Vercel
- **Database**: Supabase (PostgreSQL)

## Setup Instructions
1. **Clone the Repository**:
   ```bash
   git clone https://github.com/arulprakasht/VapiShowAssist.git
   cd VapiShowAssist
   ```
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Set Environment Variables**:
   Create a `.env` file in the root directory with the following:
   ```env
   PORT=3000
   VAPI_PRIVATE_KEY=your_vapi_private_key
   VAPI_PUBLIC_KEY=your_vapi_public_key
   VAPI_ASSISTANT_ID=your_vapi_assistant_id
   VAPI_TWILIO_PHONE_NUMBER_ID=your_vapi_phone_number_id
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   ALLOWED_ORIGINS=https://vapishowassist.vercel.app
   ```
   - Obtain `VAPI_*` keys from the Vapi.ai dashboard.
   - Get `SUPABASE_URL` and `SUPABASE_ANON_KEY` from your Supabase project.
4. **Set Up Supabase**:
   - Create a Supabase project and run the `schema.sql` file to create the `leads` table:
     ```sql
     CREATE TABLE leads (
         id SERIAL PRIMARY KEY,
         name TEXT NOT NULL,
         phone TEXT UNIQUE NOT NULL,
         preferred_time TEXT NOT NULL,
         showing_address TEXT NOT NULL,
         status TEXT DEFAULT 'pending',
         showing_date TIMESTAMP
     );
     ```
   - Enable real-time subscriptions for the `leads` table in Supabase.
5. **Run Locally**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.
6. **Test with Sample Data**:
   Use the included `sample-leads.csv` to test lead uploads.

## Usage
1. **Upload Leads**:
   - Prepare a CSV file with columns: `name`, `phone`, `preferred_time`, `showing_address`.
   - Click "Choose File" to select your CSV, then "Upload Leads" to import leads.
2. **Schedule Showings**:
   - Click "Start Calls" to initiate outbound calls using Vapi.ai’s assistant.
   - The app will call leads and update their status based on call outcomes.
3. **View Scheduled Showings**:
   - Check the "Scheduled Showings" table for real-time updates on lead status and showing dates.
   - Filter or sort the table as needed (feature in progress).

## Deployment
1. Push your code to the GitHub repository.
2. Connect the repository to Vercel via the dashboard or CLI.
3. Add environment variables in Vercel’s settings.
4. Deploy and verify the live site at `https://vapishowassist.vercel.app`.

## Future Enhancements
- **Google Calendar Integration**: Sync confirmed showings with Google Calendar.
- **Call Analytics**: Display call success rates and stats in the UI.
- **Custom Assistant Options**: Allow selection of different Vapi.ai voice profiles.
- **Advanced Filters**: Add sortable and filterable columns to the "Scheduled Showings" table.

## License
ISC License

## Contact
For issues or questions, please open an issue on the [GitHub Issues](https://github.com/arulprakasht/VapiShowAssist/issues) page.

## Vapi.ai Build Challenge Submission
- **Description**: VapiShowAssist streamlines real estate showing scheduling by leveraging Vapi.ai’s AI voice assistant and Supabase for lead management. Agents can upload leads, initiate personalized calls, and track appointments in real-time, all within a secure, scalable web app built with Node.js, Express, and Tailwind CSS.
- **Links**: GitHub, Demo, Video (if time permits).