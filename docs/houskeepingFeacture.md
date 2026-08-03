Add and Develop a feacture in this project.
Process: 
create checklist of all task to develop this feacture. 

Requirment: 
The application will be used by supervisors, community managers, housekeeping managers, facility managers, security staff, and senior management to inspect coworking centres, verify staff movement, analyse cleanliness through photographs, monitor generator usage, and generate management reports.

## 1. Primary Objectives

Build a mobile-first web application or Progressive Web App through which:

1. Supervisors and community managers visit each designated inspection location.
2. They scan the QR code installed at that location.
3. The system verifies that they are physically present at the location.
4. The system records:

   * User name
   * User role
   * Centre
   * Area
   * Date and time
   * GPS coordinates
   * Device ID
   * QR code ID
   * Visit sequence
   * Time spent at the location
   * Movement between locations
5. The supervisor or community manager captures and uploads four live photographs of each inspection area.
6. Every photograph is automatically analysed using an AI vision model.
7. The system identifies cleanliness, maintenance, safety, consumable, and compliance issues.
8. A consolidated summary is generated for managers.
9. Management receives alerts for serious issues, missed inspections, suspicious scanning behaviour, and generator fuel or meter discrepancies.

## 2. User Roles

Create role-based access control for:

### Super Admin

* Create and manage centres.
* Create inspection locations.
* Generate and download QR codes.
* Configure inspection frequency.
* Configure mandatory photographs.
* Configure escalation rules.
* Configure email groups.
* Manage users and permissions.
* View all centres and reports.
* Configure AI prompts and scoring rules.
* Configure data-retention periods.

### Senior Management

* View summaries across all centres.
* View cleanliness and staff-efficiency scores.
* View missed inspections.
* View critical alerts.
* Compare centres.
* View repeated issues.
* Download PDF and Excel reports.

### Facility Manager

* View inspections for assigned centres.
* Assign corrective actions.
* Approve or reject inspection submissions.
* Review AI analysis.
* Close issues after verification.
* View generator records and discrepancies.

### Community Manager

* Scan QR codes.
* Capture and upload inspection photographs.
* Add observations.
* Report maintenance issues.
* Review AI-generated findings before submission.
* Confirm or correct AI findings.

### Supervisor

* Perform complete inspection rounds.
* Scan each location.
* Upload four live photographs per area.
* Add comments.
* Report housekeeping staff present.
* Record rectification.
* Reinspect failed locations.

### Housekeeping Manager

* View housekeeping-related issues.
* Assign tasks to housekeeping staff.
* Mark tasks as started and completed.
* Upload “after cleaning” photographs.
* View efficiency score and repeat failures.

### Security or Generator Operator

* Mark generator ON and OFF.
* Upload generator meter and tank photographs.
* Enter meter reading, fuel level, and operating hours.
* Add diesel filling entries.

## 3. Inspection Locations

Initially configure the following inspection areas:

* 8 bathrooms
* 5 common areas
* Parking area
* Back area
* Front area
* Guard room
* Electricity room
* Generator area
* Generator fuel tank
* Additional configurable areas

The system must not hard-code these quantities. The admin must be able to create, remove, rename, group, or reorder inspection locations.

Each location should have:

* Centre ID
* Floor
* Location name
* Location category
* Unique QR code
* GPS coordinates
* Permitted geofence radius
* Mandatory inspection frequency
* Mandatory photograph count
* Required photograph angles
* Inspection checklist
* Priority level
* Escalation rules

## 4. QR Code and Location Verification

The system must prevent a person from collecting or photographing all QR codes and scanning them from one place.

Implement multiple verification controls:

1. GPS geofencing:

   * Compare the user’s current GPS location with the saved location coordinates.
   * Reject or flag scans outside the permitted radius.
   * Allow configurable radius per location.

2. QR scan timestamp:

   * Record exact server-side time.
   * Do not rely only on mobile-device time.

3. Live camera capture:

   * Photographs must be captured directly through the application.
   * Do not allow normal gallery uploads for routine inspections.
   * Allow gallery upload only to authorised managers, with a visible exception flag.

4. Device tracking:

   * Record device fingerprint or registered device ID.
   * Flag rapid switching between devices.

5. Movement validation:

   * Record GPS points during an inspection round.
   * Calculate travel time and distance between inspection locations.
   * Flag physically impossible movement.

6. Minimum time at location:

   * Configure minimum inspection time for each area.
   * Flag scans completed too quickly.

7. QR scan sequence:

   * Permit flexible sequence but flag multiple scans occurring unrealistically close together.

8. Dynamic QR security:

   * Support rotating or time-limited QR validation.
   * QR code should identify the location, but verification should be completed against the server.
   * Do not store sensitive information directly inside the QR code.

9. Photograph verification:

   * Check whether the uploaded photographs visually correspond with the expected area.
   * Detect reused or duplicate photographs.
   * Detect photographs previously submitted at another location.
   * Compare perceptual hashes to identify repeated images.
   * Verify image capture time.
   * Flag screenshots, WhatsApp-forwarded images, or edited images where detectable.

10. Offline mode:

* Allow inspections in poor-network conditions.
* Store encrypted inspection data locally.
* Synchronise once internet connectivity returns.
* Clearly mark the original capture time and synchronisation time.
* Do not allow offline records to alter server timestamps.

All employee movement tracking must only run during an active inspection round and must comply with applicable privacy and employment requirements.

## 5. Photograph Requirements

For each inspection area, require four live photographs.

The admin should be able to define the required angles, such as:

* Entrance or full-area photograph
* Left-side photograph
* Right-side photograph
* Close-up or critical-point photograph

For bathrooms, the four photographs may include:

* Washbasin and mirror
* Toilet or urinal area
* Floor and drainage
* Consumables and dustbin

For common areas:

* Full room view
* Tables and workstations
* Floor and corners
* Dustbins or pantry area

Each image record must store:

* Inspection ID
* Location ID
* User ID
* Capture timestamp
* Server timestamp
* GPS coordinates
* Device ID
* Image hash
* File path
* Image quality score
* AI analysis
* AI confidence level
* User confirmation or correction
* Before or after status
* Retake reason, if applicable

The application should guide the user to retake photographs when:

* Image is blurred.
* Image is too dark.
* Image is overexposed.
* Required area is not visible.
* Photograph appears duplicated.
* Camera is covered.
* Photograph is taken from too far away.
* AI confidence is below the configured limit.

## 6. AI Image Analysis

Use a locally deployable multimodal vision-language model instead of depending entirely on an external cloud AI service.

The architecture should support:

* Local multimodal vision model through Ollama, vLLM, or another self-hosted inference server.
* Local OCR engine for reading meters and labels.
* Optional external AI API as a configurable fallback.
* AI model abstraction layer so that the model can be changed without rewriting the business logic.
* Complete storage of AI output, confidence score, model name, model version, and analysis timestamp.

The photographs and inspection data should be capable of being stored on the organisation’s local server or private cloud.

For image storage, support:

* Local file storage
* S3-compatible private storage such as MinIO
* Configurable retention period
* Encrypted storage
* Role-based access
* Automatic image compression while retaining sufficient inspection quality

### AI Analysis Categories

Analyse each photograph for:

#### Cleanliness

* Wet floor
* Dirty floor
* Stains
* Dust
* Dirt in corners
* Overflowing dustbin
* Unclean toilet
* Dirty washbasin
* Dirty mirror
* Debris
* Cobwebs
* Unclean tables
* Unorganised furniture
* Unclean parking area

#### Consumables

* Missing toilet paper
* Missing handwash
* Missing tissue paper
* Missing sanitiser
* Missing dustbin liner
* Empty soap dispenser
* Low consumable level

#### Maintenance

* Water leakage
* Damaged tap
* Broken fixture
* Damaged toilet seat
* Cracked tile
* Damaged furniture
* Faulty light
* Exposed wire
* Damaged switchboard
* Seepage
* Dampness
* Blocked drain
* Non-working exhaust
* Broken lock or door

#### Safety

* Obstructed passage
* Wet-floor risk
* Exposed electrical connection
* Fire-safety obstruction
* Open electrical panel
* Unsafe material storage
* Diesel leakage
* Oil leakage
* Unauthorised item in electricity room
* Generator-area obstruction

#### Presentation and Organisation

* Chairs not aligned
* Tables not arranged
* Reception area not presentable
* Loose wires
* Unnecessary boxes
* Improper storage
* Branding or signage damage

The AI must return structured JSON, for example:

{
"overall_condition": "poor",
"cleanliness_score": 58,
"maintenance_score": 70,
"safety_score": 82,
"issues": [
{
"category": "cleanliness",
"issue": "Wet and stained floor near washbasin",
"severity": "high",
"confidence": 0.91,
"recommended_action": "Clean and dry the floor immediately and place a wet-floor sign"
}
],
"consumables": {
"handwash": "low",
"toilet_paper": "available",
"tissue": "missing"
},
"requires_immediate_action": true
}

The supervisor or community manager should be able to:

* Accept the AI findings.
* Correct an incorrect finding.
* Add a missed issue.
* Mark a finding as not applicable.
* Add voice or text comments.

Store all corrections for future model evaluation and improvement.

## 7. Area-Level Inspection Summary

After analysing four photographs, generate one consolidated result for the area.

The system must not simply repeat four separate image analyses. It should combine them into:

* Overall area condition
* Cleanliness score
* Maintenance score
* Safety score
* Consumables score
* Number of critical issues
* Number of non-critical issues
* Recommended corrective actions
* Whether reinspection is required
* Comparison with the previous inspection
* New issues
* Resolved issues
* Repeated issues
* Deterioration or improvement

## 8. Management Summary

Generate automatic summaries for managers at the following levels:

### Inspection-Round Summary

* Locations inspected
* Locations missed
* Total photographs uploaded
* Failed photograph validations
* Critical issues
* Repeat issues
* Corrective actions required
* Inspection completion time
* Distance travelled
* Suspicious activity flags
* Overall score

### Centre Daily Summary

* Centre cleanliness score
* Bathroom-wise score
* Common-area score
* Parking score
* Front and back-area score
* Guard-room score
* Electricity-room score
* Generator compliance score
* Missed inspections
* Delayed inspections
* Open issues
* Closed issues
* Repeat issues
* Staff efficiency
* Best-performing area
* Worst-performing area
* Management attention required

### Weekly and Monthly Summary

* Score trends
* Issue trends
* Centre comparison
* Supervisor comparison
* Community-manager inspection compliance
* Repeated housekeeping failures
* Average rectification time
* Missed inspection rate
* Reinspection success rate
* Generator discrepancies
* Diesel consumption trend
* Cost-impact observations
* AI confidence and correction rate

Provide the summary in:

* Dashboard format
* Email format
* Downloadable PDF
* Excel or CSV export

## 9. Housekeeping Efficiency Measurement

Create a housekeeping efficiency score based on configurable weightages.

Suggested factors:

* Inspection cleanliness score
* Number of failed areas
* Number of repeat issues
* Time taken to rectify issues
* Reinspection result
* Missed cleaning schedules
* Consumable replenishment compliance
* Supervisor verification
* Complaint count
* Safety violations
* Before-and-after photo improvement
* Attendance, where integrated
* Area workload
* Centre occupancy

Do not score staff solely on the number of reported issues. Adjust the score based on area size, usage, occupancy, shift duration, and severity.

Example:

Efficiency Score =
30% cleanliness score +
20% repeat-issue control +
15% rectification time +
15% schedule compliance +
10% consumable compliance +
10% supervisor verification

All weightages must be configurable by the admin.

Provide:

* Staff-wise score
* Shift-wise score
* Centre-wise score
* Area-wise score
* Trend over time
* Reasons behind score reduction
* Audit trail for manual score changes

## 10. Corrective Action Workflow

When an issue is detected:

1. Create an issue ticket automatically.
2. Assign it to the relevant housekeeping or maintenance staff.
3. Set severity:

   * Critical
   * High
   * Medium
   * Low
4. Set due time based on severity.
5. Notify the responsible person.
6. Allow the assignee to mark work as started.
7. Require an after-action photograph.
8. Analyse the after-action photograph.
9. Compare before and after images.
10. Allow supervisor or manager to verify and close the issue.
11. Escalate overdue issues automatically.

Critical issues may include:

* Water leakage near electrical equipment
* Exposed wires
* Open electrical panels
* Diesel leakage
* Unsafe generator condition
* Severely dirty toilet
* Blocked emergency path
* Major water overflow

## 11. Generator Monitoring Module

Create a dedicated generator monitoring module.

### Generator Status

Authorised users must mark:

* Generator switched ON
* Generator switched OFF
* Start timestamp
* Stop timestamp
* Reason for use
* Person operating the generator
* Starting fuel reading
* Closing fuel reading
* Starting hour-meter reading
* Closing hour-meter reading
* Load reading, where available
* Comments

Use server time for generator ON and OFF events.

### Generator Photographs

Whenever the generator is switched ON:

* Require a live photograph of the generator control panel.
* Require a live photograph of the fuel tank or fuel gauge.
* Use OCR or image analysis to extract:

  * Fuel reading
  * Hour-meter reading
  * Voltage
  * Current
  * Frequency
  * Other visible readings

While the generator remains ON:

* Require a new generator tank or gauge photograph every 30 minutes.
* Send reminders before the next photograph is due.
* Escalate if the photograph is not uploaded within the configured grace period.
* Allow the frequency to be changed by the admin.

When switched OFF:

* Require final tank photograph.
* Require final meter photograph.
* Calculate run duration.
* Calculate fuel difference.
* Calculate fuel consumption per hour.
* Compare consumption with normal range.

### Generator Discrepancy Logic

Maintain a chronological generator-reading ledger.

Each reading must contain:

* Generator ID
* Centre ID
* Timestamp
* User
* Status
* Fuel reading
* Hour-meter reading
* OCR confidence
* User-entered reading
* Photograph
* Previous reading
* Difference
* Associated ON/OFF event

Generate an immediate alert when:

1. The fuel reading changes from the previous verified reading, but no generator ON event was recorded.
2. The hour-meter reading increases, but the generator was not marked ON.
3. Fuel decreases beyond an acceptable tolerance without a corresponding generator run.
4. Generator is marked ON but the hour-meter does not change.
5. Generator is running but the mandatory 30-minute photograph is missing.
6. OCR reading and manually entered reading differ beyond the configured tolerance.
7. Fuel level increases but no diesel-refill entry exists.
8. Fuel consumption is unusually high.
9. A previous photograph appears to have been reused.
10. Generator ON or OFF was backdated.
11. The generator remained marked ON beyond a configured duration.
12. Two users enter conflicting readings.

Example alert rule:

IF current_hour_meter > previous_hour_meter
AND no valid generator_on_event exists between the two readings
THEN create a critical discrepancy alert.

Example fuel rule:

IF absolute(current_fuel_reading - previous_fuel_reading) > allowed_tolerance
AND no valid generator_on_event or diesel_refill_event exists
THEN create a critical fuel discrepancy alert.

The tolerances must be configurable by the admin.

## 12. Email and Notification Alerts

Support configurable alert groups.

Create settings for:

* Management email group
* Facility email group
* Accounts email group
* Security email group
* Centre-specific email group

Use placeholders such as:

* [management@company.com](mailto:management@company.com)
* [facilities@company.com](mailto:facilities@company.com)
* [accounts@company.com](mailto:accounts@company.com)

Allow multiple recipients, CC recipients, and centre-specific escalation groups.

Send email and in-app alerts for:

* Generator reading discrepancy
* Fuel-level discrepancy
* Generator used without ON entry
* Hour meter increased without ON entry
* Missed 30-minute generator photograph
* Missed inspection
* Critical cleanliness issue
* Critical safety issue
* Electricity-room violation
* Repeated failed area
* Suspicious QR scanning
* Duplicate photograph
* Inspection completed too quickly
* Corrective action overdue

Each alert email must include:

* Centre
* Area
* Date and time
* User
* Alert type
* Previous reading
* Current reading
* Difference
* Related photographs
* AI findings
* Severity
* Recommended action
* Link to the dashboard record

Maintain a complete notification log showing:

* Alert generated
* Email recipients
* Delivery status
* Read or acknowledgement status
* Escalation status
* Resolution status

## 13. Dashboards

### Management Dashboard

Display:

* Overall facility score
* Today’s inspection compliance
* Centre-wise scores
* Open critical issues
* Generator discrepancies
* Bathrooms requiring attention
* Repeated housekeeping failures
* Staff efficiency ranking
* Issue-resolution time
* Missed inspections
* Live alerts
* Daily trend
* Weekly trend
* Monthly trend

### Centre Dashboard

Display:

* Floor plan or area list
* Latest photograph for each location
* Last inspection time
* Next inspection due
* Current score
* Open issues
* Assigned staff
* Generator status
* Fuel and meter readings
* Inspection route

### Supervisor Dashboard

Display:

* Assigned inspection rounds
* Pending locations
* Completed locations
* Rejected photographs
* Retakes required
* Corrective actions awaiting verification
* Personal compliance score

### Housekeeping Dashboard

Display:

* Assigned issues
* Severity
* Due time
* Before image
* Required action
* Upload after image
* Reinspection status
* Efficiency score

## 14. Reports

Create the following reports:

* Daily centre inspection report
* Area-wise cleanliness report
* Bathroom inspection report
* Common-area inspection report
* Staff efficiency report
* Missed inspection report
* Inspection movement report
* Suspicious scanning report
* Duplicate-image report
* Corrective-action ageing report
* Repeat-issue report
* Generator runtime report
* Generator fuel-consumption report
* Generator discrepancy report
* Diesel refill report
* AI analysis accuracy report
* AI correction report
* Centre comparison report

Support filters for:

* Centre
* Date range
* User
* Role
* Area
* Floor
* Inspection status
* Issue category
* Severity
* Generator
* Shift

## 15. Suggested Technical Architecture

Use a maintainable modular architecture.

Preferred stack:

### Frontend

* React, Next.js, or Vue
* Mobile-first responsive design
* Progressive Web App
* Camera integration
* QR scanner
* GPS permission
* Offline encrypted storage
* Push notifications
* Dashboard charts
* Role-based UI

### Backend

Choose one:

* Laravel
* Node.js with NestJS
* Python with FastAPI or Django

Use:

* REST API
* Background job queue
* Scheduled tasks
* WebSocket or Server-Sent Events for live alerts
* Role-based access control
* Audit logging
* API documentation through OpenAPI or Swagger



### Image Storage

* Local encrypted storage or MinIO
* Optional S3 integration
* Signed URLs
* Thumbnail generation
* Retention policy

### AI Service

Create a separate AI microservice.

Components:

* Local multimodal vision-language model
* OCR engine
* Image-quality detection
* Duplicate-image detection
* Perceptual hashing
* Before-and-after image comparison
* Structured JSON response
* Model confidence score
* Retry queue
* Manual-review fallback

The system must continue accepting inspections even if the AI service is temporarily unavailable. Mark those inspections as “AI analysis pending” and process them when the service becomes available.

Do not allow AI service failure to delete or block the original inspection evidence.

## 16. Suggested Database Tables

Create migrations and relationships for at least:

* users
* roles
* permissions
* centres
* floors
* inspection_locations
* location_qr_codes
* inspection_templates
* checklist_items
* inspection_schedules
* inspection_rounds
* inspection_visits
* inspection_photos
* gps_logs
* device_registrations
* ai_analysis_jobs
* ai_photo_findings
* area_summaries
* issues
* corrective_actions
* reinspection_records
* housekeeping_staff
* staff_assignments
* staff_efficiency_scores
* generators
* generator_events
* generator_readings
* generator_photos
* generator_refills
* generator_discrepancies
* alert_rules
* alerts
* alert_recipients
* notification_logs
* email_groups
* audit_logs
* system_settings

Use proper:

* Foreign keys
* Indexes
* Soft deletes where appropriate
* Created and updated timestamps
* Immutable audit records for critical events
* UUIDs for externally visible records

## 17. API Modules

Create documented APIs for:

* Authentication
* User management
* Centre management
* Location management
* QR generation
* QR validation
* Inspection scheduling
* Inspection-round start and completion
* Location scanning
* GPS validation
* Live photograph upload
* AI analysis
* Issue creation
* Corrective action
* Reinspection
* Generator ON/OFF
* Generator reading upload
* Fuel refill
* Discrepancy detection
* Alert management
* Dashboard statistics
* Reports
* PDF export
* Excel export
* Settings

## 18. Audit Trail

Every important action must be auditable.

Record:

* Who performed the action
* Role
* Device
* IP address
* Previous value
* New value
* Server timestamp
* GPS location, where applicable
* Reason for manual override

Do not allow normal users to delete:

* Inspection records
* Generator readings
* Alerts
* Audit logs
* Original photographs

Any administrative correction must create a new version and preserve the original value.

## 19. Security Requirements

Implement:

* Secure authentication
* Password hashing
* Optional OTP login
* Optional two-factor authentication
* JWT or secure session authentication
* Role-based authorisation
* Rate limiting
* CSRF protection where applicable
* Input validation
* Malware-safe file processing
* File-type verification
* Encrypted transport
* Encryption at rest for sensitive data
* Signed photograph URLs
* Session timeout
* Device revocation
* Audit logging
* Backup and restore procedures

Never expose local server paths or AI-service credentials to the frontend.

## 20. User Experience

The inspection process should require minimal typing.

Use:

* Large mobile buttons
* Visual inspection checklist
* QR scanner
* Camera guidance overlay
* Voice comments
* Automatic location detection
* Progress indicator
* Clear retake instructions
* Traffic-light scoring
* Hindi and English support
* Low-bandwidth optimisation

Suggested inspection flow:

1. Log in.
2. Select centre or use assigned centre.
3. Start inspection round.
4. Grant location permission.
5. Scan location QR.
6. Validate geofence.
7. Display four required photograph angles.
8. Capture four live photographs.
9. Check photograph quality.
10. Run AI analysis.
11. Display AI findings.
12. User confirms or corrects findings.
13. Submit the location.
14. Move to next area.
15. Complete round.
16. Generate management summary.

## 21. Acceptance Criteria

The completed application must demonstrate that:

1. An admin can create a centre and inspection locations.
2. QR codes can be generated and printed.
3. A supervisor can scan a QR code using a mobile device.
4. The system records server time, GPS, user, device, and location.
5. Scans outside the geofence are rejected or flagged.
6. Four live photographs are mandatory for configured areas.
7. Duplicate photographs are detected.
8. AI generates structured cleanliness and maintenance findings.
9. A consolidated area summary is generated.
10. A daily management summary is generated.
11. Corrective actions can be assigned and closed with after photographs.
12. Staff-efficiency scores are calculated.
13. Generator ON and OFF events can be recorded.
14. Generator photographs are required every 30 minutes while running.
15. OCR can extract generator readings from photographs.
16. An alert is generated when readings change without a recorded generator ON event.
17. Email alerts are sent to configured groups.
18. Management can view centre-wise and staff-wise reports.
19. The application works on mobile and desktop.
20. Inspection data remains available if AI analysis temporarily fails.
21. All critical changes appear in an immutable audit trail.
22. The system can run using a locally hosted AI model and private image storage.

## 22. Required Deliverables

Provide:

* Complete frontend source code
* Complete backend source code
* AI microservice source code
* Database migrations
* Seed data
* API documentation
* Swagger or OpenAPI collection
* Docker configuration
* Docker Compose setup
* Environment configuration example
* Local AI setup instructions
* MinIO setup instructions
* Email configuration
* Background-worker configuration
* Scheduled-job configuration
* Unit tests
* Integration tests
* End-to-end tests
* Sample inspection data
* Sample generator data
* Sample alert rules
* Sample management reports
* Deployment guide
* Backup and restoration guide
* Security checklist
* User manual
* Admin manual


## Client Cleaning Request Module

When a client scans the area QR code, the public screen must display two clear options:

1. **Request Cleaning**
2. **Report a Problem**

A cleaning request is different from a complaint. Clients should be able to request cleaning even when there is no serious issue or service failure.

### 23. Request Cleaning Workflow

After scanning the QR code, the client should:

1. Select their company name from the ERP-linked client list.
2. Confirm the automatically detected centre, floor, and area.
3. Select **Request Cleaning**.
4. Select the required service.
5. Add an optional note or photograph.
6. Submit the request.

The entire process should take less than 30 seconds.

### 24. Cleaning Request Types

Allow clients to request:

* Bathroom cleaning
* Floor cleaning
* Table cleaning
* Cabin cleaning
* Meeting-room cleaning
* Common-area cleaning
* Pantry cleaning
* Dustbin clearance
* Spill cleaning
* Glass or mirror cleaning
* Sofa or chair cleaning
* Parking-area cleaning
* Consumable replenishment
* Sanitisation
* Urgent cleaning
* Other cleaning assistance

For consumables, allow the client to select:

* Handwash
* Toilet paper
* Tissue paper
* Sanitiser
* Dustbin liner
* Drinking water
* Paper cups
* Other consumable

The admin must be able to add, remove, rename, or deactivate request types.

### 25. Request Priority

Allow the client to select:

* Normal
* Urgent

The system may automatically mark requests as urgent when they involve:

* Liquid spill
* Wet floor
* Broken glass
* Bathroom overflow
* Vomit or biological waste
* Strong foul smell
* Client meeting in progress
* Safety risk

### 26. Automatic Service Request Ticket

Every cleaning request must create a service ticket with:

* Ticket number
* Request type
* Centre
* Floor
* Area
* QR code ID
* Client company
* Client name, where provided
* Description
* Photograph, where provided
* Request priority
* Submission time
* Assigned housekeeping employee
* Expected response time
* Current status
* Completion time
* Before and after photographs
* Client feedback

Cleaning request statuses should include:

* New
* Assigned
* Accepted
* Staff on the way
* Cleaning in progress
* Completed
* Awaiting client confirmation
* Closed
* Reopened
* Cancelled

### 27. Housekeeping Assignment

Automatically assign the request based on:

* Centre
* Floor
* Area
* Staff shift
* Staff availability
* Current workload
* Type of cleaning required
* Priority

The housekeeping employee or supervisor should receive:

* In-app alert
* Area name
* Floor
* Request type
* Client note
* Photograph
* Required response time
* Route or location instructions

The housekeeping employee should be able to select:

* Accept request
* On the way
* Work started
* Work completed
* Unable to complete
* Additional maintenance required

### 28. QR Verification by Housekeeping Staff

For completion, the housekeeping employee should visit the location and scan the same QR code.

The system should record:

* Staff name
* QR scan time
* GPS location
* Arrival time
* Work start time
* Completion time
* Time taken to reach the location
* Time spent cleaning

Require at least one live after-cleaning photograph.

For selected areas or serious requests, require up to four after-cleaning photographs.

### 29. AI Verification

The AI vision service should analyse:

* Client photograph, where available
* After-cleaning photograph
* Difference between before and after condition
* Whether the requested cleaning appears completed
* Whether any maintenance or safety issue remains

The AI should return:

* Apparent completion status
* Cleanliness score after service
* Remaining issues
* Confidence score
* Need for supervisor verification

AI results should assist the manager but should not automatically reject a valid staff completion without human review.

### 30. Client Updates

The client should receive an optional status link showing:

* Request received
* Housekeeping assigned
* Staff on the way
* Cleaning in progress
* Request completed

Do not require the client to create an account.

Notifications may be sent through:

* Web status page
* Email
* SMS
* WhatsApp, where integrated

### 31. Client Confirmation

After completion, allow the client to select:

* Cleaning completed satisfactorily
* Partially completed
* Not completed

Allow a rating from 1 to 5 and an optional comment.

If the client selects **Not completed**, automatically reopen the request and notify:

* Housekeeping supervisor
* Community manager
* Facility manager, according to escalation rules

The admin should be able to disable mandatory client confirmation. Where no confirmation is received within the configured period, the request may be automatically closed after supervisor verification.

### 32. Cleaning Request Service Levels

Allow administrators to configure service-level targets by request type.

Example targets:

* Wet floor or spill: 5 minutes
* Bathroom cleaning: 10 minutes
* Dustbin clearance: 10 minutes
* Consumable replenishment: 10 minutes
* Meeting-room cleaning: 15 minutes
* Cabin cleaning: 20 minutes
* General common-area cleaning: 20 minutes
* Parking cleaning: 30 minutes

Generate alerts when:

* Request is not accepted within the target time.
* Staff has not reached the area.
* Cleaning remains in progress for an unusual duration.
* Completion photograph is missing.
* Client reopens the request.
* Several requests are received for the same area.
* The same client repeatedly requests the same service.
* The request is marked completed without scanning the location QR.
* The after-cleaning photograph appears reused.

### 33. Complaint Versus Cleaning Request

The application must clearly distinguish between:

#### Cleaning Request

A client is asking for a service, such as:

* Please clean this table.
* Please empty the dustbin.
* Please clean the bathroom.
* Please refill the handwash.
* Please clean the meeting room before a meeting.

#### Complaint

A client is reporting a service failure, repeated problem, maintenance issue, or safety concern, such as:

* The bathroom has remained dirty.
* Cleaning was requested but not completed.
* There is a water leakage.
* An electrical wire is exposed.
* The same issue keeps recurring.

A cleaning request may automatically convert into a complaint when:

* It breaches the service-level time.
* The client reopens it.
* It is marked completed without satisfactory resolution.
* The same request occurs repeatedly within a configured period.
* A safety or maintenance issue is detected.
* The client explicitly selects “Escalate as complaint.”

### 34. Cleaning Request Analytics

Management dashboards should show:

* Total cleaning requests
* Requests by centre
* Requests by floor
* Requests by area
* Requests by client
* Requests by type
* Normal versus urgent requests
* Average acceptance time
* Average arrival time
* Average completion time
* SLA compliance
* Reopened requests
* Client satisfaction rating
* Requests converted into complaints
* Most frequently requested locations
* Peak request hours
* Staff-wise response performance
* Supervisor-wise closure performance
* Areas generating repeated cleaning requests

These statistics should contribute to the housekeeping staff efficiency score while considering the employee’s workload, shift duration, centre occupancy, and area size.

### 35. Updated Client QR Screen

After the client selects their company name, display:

**How can we assist you?**

* Request Cleaning
* Report Cleanliness Problem
* Report Maintenance Problem
* Report Safety Issue
* Request Consumable Refill
* Give Feedback

The centre, floor, and area must remain automatically linked to the scanned QR code.