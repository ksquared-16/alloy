# Canonical Field Catalog

**Status:** Generated — do not hand-edit rows
**Generator:** `web/scripts/generateCanonicalFieldCatalogDoc.ts`
**Sources:** `childcareLayoutFieldCatalog`, `customerMemberFieldRegistry`, `inquiryChildFieldRegistry`, `opportunityFieldRegistry`, `canonicalNativeColumnParity`

**Row count:** 100

| field_key | label | entity_owner | source_table | source_column | data_type | field_type | editability | config | runtime | workflow/action | analytics | status | layout_ref_key |
|-----------|-------|--------------|--------------|---------------|-----------|------------|-------------|--------|---------|-----------------|-----------|--------|----------------|
| date_of_birth | Date of birth | child | customer_members | dob | date | date | editable | no | yes | layout / drawer | canonical entity row | native | child.date_of_birth |
| first_name | First name | child | customer_members | first_name | text | text | editable | no | yes | layout / drawer | canonical entity row | native | child.first_name |
| last_name | Last name | child | customer_members | last_name | text | text | editable | no | yes | layout / drawer | canonical entity row | native | child.last_name |
| address_line1 | Shared mailing address line 1 | customer | customers | address_line1 | text | text | editable | no | yes | layout / drawer | canonical entity row | native | location.household_address_line1 |
| address_line2 | Shared mailing address line 2 | customer | customers | address_line2 | text | text | editable | no | yes | layout / drawer | canonical entity row | native | location.household_address_line2 |
| city | Shared mailing city | customer | customers | city | text | text | editable | no | yes | layout / drawer | canonical entity row | native | location.household_address_city |
| customer_number | Family number | customer | customers | customer_number | text | text | editable | no | yes | layout / drawer | canonical entity row | native | customer.customer_number |
| family_notes | Family notes | customer | customers | family_notes | text | text | editable | no | yes | layout / drawer | canonical entity row | native | customer.family_notes |
| formatted_address | Shared household mailing address | customer | customers | formatted_address | text | text | editable | no | yes | layout / drawer | canonical entity row | native | location.household_address |
| name | Household name | customer | customers | name | text | text | editable | no | yes | layout / drawer | canonical entity row | native | customer.name |
| postal_code | Shared mailing ZIP code | customer | customers | postal_code | text | text | editable | no | yes | layout / drawer | canonical entity row | native | location.household_address_postal_code |
| state | Shared mailing state | customer | customers | state | text | text | editable | no | yes | layout / drawer | canonical entity row | native | location.household_address_state |
| status_key | Household status | customer | customers | status_key | status | status | editable | no | yes | layout / drawer | canonical entity row | native | customer.status_key |
| allergies | Allergies | customer_member | customer_members | field_values | text | text | editable | yes | yes | lifecycle / field_rules | canonical entity row | config | child.allergies |
| display_name | display name | customer_member | customer_members | display_name | text | text | editable | no | yes | PATCH customer-members | canonical entity row | native | child.display_name |
| dob | dob | customer_member | customer_members | dob | date | date | editable | no | yes | PATCH customer-members | canonical entity row | native | child.date_of_birth |
| first_name | first name | customer_member | customer_members | first_name | text | text | editable | no | yes | PATCH customer-members | canonical entity row | native | child.first_name |
| gender | Gender | customer_member | customer_members | field_values | select | select | editable | yes | yes | lifecycle / field_rules | canonical entity row | config | child.gender |
| last_name | last name | customer_member | customer_members | last_name | text | text | editable | no | yes | PATCH customer-members | canonical entity row | native | child.last_name |
| medical_notes | Medical notes | customer_member | customer_members | field_values | text | text | editable | yes | yes | lifecycle / field_rules | canonical entity row | config | child.medical_notes |
| preferred_name | Preferred name | customer_member | customer_members | field_values | text | text | editable | yes | yes | lifecycle / field_rules | canonical entity row | config | child.preferred_name |
| relationship | relationship | customer_member | customer_members | relationship | text | text | editable | no | yes | PATCH customer-members | canonical entity row | native | child.relationship |
| special_instructions | Special instructions | customer_member | customer_members | field_values | text | text | editable | yes | yes | lifecycle / field_rules | canonical entity row | config | child.special_instructions |
| age | Age | inquiry_child | customer_members | dob | text | text | computed | no | yes | layout / drawer | derived projection | computed | child.age |
| desired_program_type | Program interest | inquiry_child | opportunity_customer_members | desired_program_type | select | select | editable | yes | yes | lifecycle / field_rules | canonical entity row | native | inquiry_child.desired_program_type |
| desired_schedule_type | Schedule interest | inquiry_child | opportunity_customer_members | desired_schedule_type | select | select | editable | yes | yes | lifecycle / field_rules | canonical entity row | native | inquiry_child.desired_schedule_type |
| desired_start_date | Desired start date | inquiry_child | opportunity_customer_members | desired_start_date | date | date | editable | yes | yes | lifecycle / field_rules | canonical entity row | native | inquiry_child.desired_start_date |
| full_name | Full name | inquiry_child | customer_members | first_name | text | text | computed | no | yes | layout / drawer | derived projection | computed | child.full_name |
| location_id | Location / school | inquiry_child | opportunity_customer_members | location_id | select | select | editable | yes | yes | lifecycle / field_rules | canonical entity row | native | inquiry_child.location_id |
| notes | Notes | inquiry_child | opportunity_customer_members | notes | text | text | editable | yes | yes | lifecycle / field_rules | canonical entity row | native | inquiry_child.notes |
| outcome_status_key | Enrollment status | inquiry_child | opportunity_customer_members | outcome_status_key | status | status | editable | yes | yes | lifecycle / field_rules | canonical entity row | native | inquiry_child.outcome_status_key |
| program_room_cohort_key | Room / cohort | inquiry_child | opportunity_customer_members | program_room_cohort_key | select | select | editable | yes | yes | lifecycle / field_rules | canonical entity row | native | inquiry_child.program_room_cohort_key |
| address1 | Site address line 1 | location | locations | address1 | text | text | editable | no | yes | layout / drawer | canonical entity row | native | location.address1 |
| capacity | Capacity | location | locations | capacity | number | number | editable | no | yes | layout / drawer | canonical entity row | native | location.capacity |
| category | Programs offered | location | locations | category | select | select | editable | no | yes | layout / drawer | canonical entity row | native | location.category |
| city | Site city | location | locations | city | text | text | editable | no | yes | layout / drawer | canonical entity row | native | location.city |
| director_name | Director | location | locations | director_name | text | text | editable | no | yes | layout / drawer | canonical entity row | native | location.director_name |
| label | Site name | location | locations | label | text | text | editable | no | yes | layout / drawer | canonical entity row | native | location.label |
| postal_code | Site ZIP code | location | locations | postal_code | text | text | editable | no | yes | layout / drawer | canonical entity row | native | location.postal_code |
| site_phone | Phone | location | locations | site_phone | phone | phone | editable | no | yes | layout / drawer | canonical entity row | native | location.site_phone |
| state | Site state | location | locations | state | text | text | editable | no | yes | layout / drawer | canonical entity row | native | location.state |
| status_key | Status | location | locations | status_key | status | status | editable | no | yes | layout / drawer | canonical entity row | native | location.status_key |
| created_at | Lead created date | opportunity | opportunities | created_at | date | date | computed | no | yes | layout / drawer | derived projection | computed | opportunity.created_at |
| customer_notes | Lead notes | opportunity | opportunities | customer_notes | text | text | editable | no | yes | layout / drawer | canonical entity row | native | opportunity.customer_notes |
| location_id | Location | opportunity | opportunities | location_id | select | select | editable | yes | yes | lifecycle / field_rules | canonical entity row | native | opportunity.location_id |
| source | Lead source | opportunity | opportunities | source | text | text | editable | no | yes | layout / drawer | canonical entity row | native | opportunity.source |
| status_key | Lead status | opportunity | opportunities | status_key | status | status | editable | no | yes | layout / drawer | canonical entity row | native | opportunity.status_key |
| tour_date | Tour date | opportunity | opportunities | tour_date | date | date | editable | no | yes | layout / drawer | canonical entity row | native | opportunity.tour_date |
| tour_status | Tour status | opportunity | opportunities | tour_status | status | status | editable | no | yes | layout / drawer | canonical entity row | native | opportunity.tour_status |
| tour_time | Tour time | opportunity | opportunities | tour_time | text | text | editable | no | yes | layout / drawer | canonical entity row | native | opportunity.tour_time |
| address_line1 | Person address line 1 | person | field_values | address_line1 | text | text | editable | no | yes | layout / drawer | canonical entity row | native | person.address_line1 |
| address_line2 | Person address line 2 | person | field_values | address_line2 | text | text | editable | no | yes | layout / drawer | canonical entity row | native | person.address_line2 |
| billing_address_city | Billing contact city | person | opportunities | primary_person_id | text | text | computed | no | yes | layout / drawer | derived projection | computed | person.billing_address_city |
| billing_address_line1 | Billing contact address line 1 | person | opportunities | primary_person_id | text | text | computed | no | yes | layout / drawer | derived projection | computed | person.billing_address_line1 |
| billing_address_line2 | Billing contact address line 2 | person | opportunities | primary_person_id | text | text | computed | no | yes | layout / drawer | derived projection | computed | person.billing_address_line2 |
| billing_address_postal_code | Billing contact ZIP code | person | opportunities | primary_person_id | text | text | computed | no | yes | layout / drawer | derived projection | computed | person.billing_address_postal_code |
| billing_address_state | Billing contact state | person | opportunities | primary_person_id | text | text | computed | no | yes | layout / drawer | derived projection | computed | person.billing_address_state |
| billing_contact_email | Billing contact email | person | opportunities | primary_person_id | text | text | computed | no | yes | layout / drawer | derived projection | computed | person.billing_contact_email |
| billing_contact_name | Billing contact name | person | opportunities | primary_person_id | text | text | computed | no | yes | layout / drawer | derived projection | computed | person.billing_contact_name |
| billing_contact_phone | Billing contact phone | person | opportunities | primary_person_id | phone | phone | computed | no | yes | layout / drawer | derived projection | computed | person.billing_contact_phone |
| city | Person city | person | field_values | city | text | text | editable | no | yes | layout / drawer | canonical entity row | native | person.city |
| communication_opt_out | Communication opt-out | person | persons | communication_opt_out | boolean | boolean | editable | no | yes | layout / drawer | canonical entity row | native | person.communication_opt_out |
| communication_preference | Communication preference | person | persons | communication_preference | select | select | editable | no | yes | layout / drawer | canonical entity row | native | person.communication_preference |
| contact_notes | Notes | person | persons | contact_notes | text | text | editable | no | yes | layout / drawer | canonical entity row | native | person.contact_notes |
| email | Email | person | persons | email | text | text | editable | no | yes | layout / drawer | canonical entity row | native | person.email |
| email_opt_in | Email opt-in | person | persons | email_opt_in | boolean | boolean | editable | no | yes | layout / drawer | canonical entity row | native | person.email_opt_in |
| emergency_address_city | Emergency contact city | person | opportunities | primary_person_id | text | text | computed | no | yes | layout / drawer | derived projection | computed | person.emergency_address_city |
| emergency_address_line1 | Emergency contact address line 1 | person | opportunities | primary_person_id | text | text | computed | no | yes | layout / drawer | derived projection | computed | person.emergency_address_line1 |
| emergency_address_line2 | Emergency contact address line 2 | person | opportunities | primary_person_id | text | text | computed | no | yes | layout / drawer | derived projection | computed | person.emergency_address_line2 |
| emergency_address_postal_code | Emergency contact ZIP code | person | opportunities | primary_person_id | text | text | computed | no | yes | layout / drawer | derived projection | computed | person.emergency_address_postal_code |
| emergency_address_state | Emergency contact state | person | opportunities | primary_person_id | text | text | computed | no | yes | layout / drawer | derived projection | computed | person.emergency_address_state |
| emergency_contact_email | Emergency contact email | person | opportunities | primary_person_id | text | text | computed | no | yes | layout / drawer | derived projection | computed | person.emergency_contact_email |
| emergency_contact_name | Emergency contact name | person | opportunities | primary_person_id | text | text | computed | no | yes | layout / drawer | derived projection | computed | person.emergency_contact_name |
| emergency_contact_phone | Emergency contact phone | person | opportunities | primary_person_id | phone | phone | computed | no | yes | layout / drawer | derived projection | computed | person.emergency_contact_phone |
| employee_id | Employee ID | person | persons | employee_id | text | text | editable | no | yes | layout / drawer | canonical entity row | native | person.employee_id |
| employer | Employer | person | persons | employer | text | text | editable | no | yes | layout / drawer | canonical entity row | native | person.employer |
| first_name | First name | person | persons | first_name | text | text | editable | no | yes | layout / drawer | canonical entity row | native | person.first_name |
| is_employee | Employee | person | persons | is_employee | boolean | boolean | editable | no | yes | layout / drawer | canonical entity row | native | person.is_employee |
| is_primary_contact | Is primary contact | person | — | is_primary_contact | text | text | computed | no | yes | layout / drawer | derived projection | computed | person.is_primary_contact |
| last_name | Last name | person | persons | last_name | text | text | editable | no | yes | layout / drawer | canonical entity row | native | person.last_name |
| phone | Phone | person | persons | phone | phone | phone | editable | no | yes | layout / drawer | canonical entity row | native | person.phone |
| postal_code | Person ZIP code | person | field_values | postal_code | text | text | editable | no | yes | layout / drawer | canonical entity row | native | person.postal_code |
| primary_address_city | Primary contact city | person | opportunities | primary_person_id | text | text | computed | no | yes | layout / drawer | derived projection | computed | person.primary_address_city |
| primary_address_line1 | Primary contact address line 1 | person | opportunities | primary_person_id | text | text | computed | no | yes | layout / drawer | derived projection | computed | person.primary_address_line1 |
| primary_address_line2 | Primary contact address line 2 | person | opportunities | primary_person_id | text | text | computed | no | yes | layout / drawer | derived projection | computed | person.primary_address_line2 |
| primary_address_postal_code | Primary contact ZIP code | person | opportunities | primary_person_id | text | text | computed | no | yes | layout / drawer | derived projection | computed | person.primary_address_postal_code |
| primary_address_state | Primary contact state | person | opportunities | primary_person_id | text | text | computed | no | yes | layout / drawer | derived projection | computed | person.primary_address_state |
| primary_contact_name | Primary contact name | person | opportunities | primary_person_id | text | text | computed | no | yes | layout / drawer | derived projection | computed | person.primary_contact_name |
| primary_email | Primary contact email | person | opportunities | primary_person_id | text | text | computed | no | yes | layout / drawer | derived projection | computed | person.primary_email |
| primary_phone | Primary contact phone | person | opportunities | primary_person_id | phone | phone | computed | no | yes | layout / drawer | derived projection | computed | person.primary_phone |
| secondary_address_city | Secondary contact city | person | opportunities | primary_person_id | text | text | computed | no | yes | layout / drawer | derived projection | computed | person.secondary_address_city |
| secondary_address_line1 | Secondary contact address line 1 | person | opportunities | primary_person_id | text | text | computed | no | yes | layout / drawer | derived projection | computed | person.secondary_address_line1 |
| secondary_address_line2 | Secondary contact address line 2 | person | opportunities | primary_person_id | text | text | computed | no | yes | layout / drawer | derived projection | computed | person.secondary_address_line2 |
| secondary_address_postal_code | Secondary contact ZIP code | person | opportunities | primary_person_id | text | text | computed | no | yes | layout / drawer | derived projection | computed | person.secondary_address_postal_code |
| secondary_address_state | Secondary contact state | person | opportunities | primary_person_id | text | text | computed | no | yes | layout / drawer | derived projection | computed | person.secondary_address_state |
| secondary_contact_name | Secondary contact name | person | opportunities | primary_person_id | text | text | computed | no | yes | layout / drawer | derived projection | computed | person.secondary_contact_name |
| secondary_email | Secondary contact email | person | opportunities | primary_person_id | text | text | computed | no | yes | layout / drawer | derived projection | computed | person.secondary_email |
| secondary_phone | Secondary contact phone | person | opportunities | primary_person_id | phone | phone | computed | no | yes | layout / drawer | derived projection | computed | person.secondary_phone |
| sms_opt_in | SMS opt-in | person | persons | sms_opt_in | boolean | boolean | editable | no | yes | layout / drawer | canonical entity row | native | person.sms_opt_in |
| state | Person state | person | field_values | state | text | text | editable | no | yes | layout / drawer | canonical entity row | native | person.state |

## Regenerate

```bash
cd web && npx tsx scripts/generateCanonicalFieldCatalogDoc.ts
```
