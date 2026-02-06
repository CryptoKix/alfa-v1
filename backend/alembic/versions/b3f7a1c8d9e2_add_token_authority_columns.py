"""Add mint_authority and freeze_authority columns to sniped_tokens

Revision ID: b3f7a1c8d9e2
Revises: ad26e622d5bd
Create Date: 2025-02-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b3f7a1c8d9e2'
down_revision: Union[str, None] = 'ad26e622d5bd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sniped_tokens', sa.Column('mint_authority', sa.Text(), nullable=True))
    op.add_column('sniped_tokens', sa.Column('freeze_authority', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('sniped_tokens', 'freeze_authority')
    op.drop_column('sniped_tokens', 'mint_authority')
