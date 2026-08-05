- [ ] Verify existing model base usage (BaseModel timestamps)
- [ ] Implement User SQLAlchemy 2.0 model with UUID PK, unique clerk_user_id + email, name fields, and 1-1 relationship to Profile
- [ ] Implement Profile SQLAlchemy 2.0 model with UUID PK, FK to users.id (unique for 1-1), required fields, and back_populates relationship
- [ ] Ensure only app/models/user.py and app/models/profile.py are modified (no other files)
- [ ] Final verification by re-reading modified files

