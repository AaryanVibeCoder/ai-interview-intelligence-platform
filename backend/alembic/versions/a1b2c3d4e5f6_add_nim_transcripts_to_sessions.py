"""Add nim_transcripts and audio_store to interview_sessions"""

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = 'a1b2c3d4e5f6'
down_revision = 'c8a22cd6ead8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add nim_transcripts and audio_store JSON columns to interview_sessions."""
    # nim_transcripts: maps question_index (str) -> NIM transcript text or None
    op.add_column(
        'interview_sessions',
        sa.Column(
            'nim_transcripts',
            sa.JSON(),
            nullable=True,
            comment=(
                "Post-interview NIM ASR transcripts keyed by question index. "
                "Structure: {'0': 'text...', '1': None, ...}. "
                "None value means NIM transcription failed for that answer. "
                "Never overwrites browser_transcript in conversation_history."
            ),
        ),
    )
    # audio_store: maps question_index (str) -> local file path or blob reference
    op.add_column(
        'interview_sessions',
        sa.Column(
            'audio_store',
            sa.JSON(),
            nullable=True,
            comment=(
                "Paths/references to recorded audio blobs per answer. "
                "Structure: {'0': '/path/to/audio.wav', ...}. "
                "Tagged with session_id + question_index + timestamp."
            ),
        ),
    )


def downgrade() -> None:
    """Remove nim_transcripts and audio_store columns from interview_sessions."""
    op.drop_column('interview_sessions', 'audio_store')
    op.drop_column('interview_sessions', 'nim_transcripts')
