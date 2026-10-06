from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("pits", "0001_initial"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="liquorsample",
            options={"ordering": ["-taken_at", "-id"]},
        ),
    ]
